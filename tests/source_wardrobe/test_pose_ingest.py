from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from source_wardrobe import pose_ingest


@pytest.fixture
def fake_pose_image(tmp_path):
    img = tmp_path / "pose.jpg"
    img.write_bytes(b"fake image data")
    return img


@patch("source_wardrobe.pose_ingest.store.upsert_pose")
@patch("source_wardrobe.pose_ingest.store.upsert_person")
@patch("source_wardrobe.pose_ingest.store.person_exists", return_value=False)
@patch("source_wardrobe.pose_ingest.store.ensure_schema")
@patch("source_wardrobe.pose_ingest.vision.describe_person_pose", return_value="Athletic build.")
@patch("source_wardrobe.pose_ingest._image_store")
def test_pose_ingest_creates_person_when_not_exists(
    mock_store_path,
    mock_describe,
    mock_schema,
    mock_exists,
    mock_upsert_person,
    mock_upsert_pose,
    fake_pose_image,
    tmp_path,
    monkeypatch,
):
    mock_store_path.return_value = tmp_path / "wardrobe"
    monkeypatch.setattr(
        "sys.argv",
        ["gravity-wardrobe-pose", "--person", "garrett", "--image", str(fake_pose_image)],
    )
    pose_ingest.main()
    mock_upsert_person.assert_called_once_with("garrett", "Garrett")


@patch("source_wardrobe.pose_ingest.store.upsert_pose")
@patch("source_wardrobe.pose_ingest.store.upsert_person")
@patch("source_wardrobe.pose_ingest.store.person_exists", return_value=True)
@patch("source_wardrobe.pose_ingest.store.ensure_schema")
@patch("source_wardrobe.pose_ingest.vision.describe_person_pose", return_value="Average build.")
@patch("source_wardrobe.pose_ingest._image_store")
def test_pose_ingest_saves_description(
    mock_store_path,
    mock_describe,
    mock_schema,
    mock_exists,
    mock_upsert_person,
    mock_upsert_pose,
    fake_pose_image,
    tmp_path,
    monkeypatch,
):
    mock_store_path.return_value = tmp_path / "wardrobe"
    monkeypatch.setattr(
        "sys.argv",
        ["gravity-wardrobe-pose", "--person", "garrett", "--image", str(fake_pose_image)],
    )
    pose_ingest.main()
    args = mock_upsert_pose.call_args[0]
    assert args[0] == "garrett"
    assert "Average build." in args[2]


def test_pose_ingest_exits_when_image_not_found(monkeypatch):
    monkeypatch.setattr(
        "sys.argv",
        ["gravity-wardrobe-pose", "--person", "garrett", "--image", "/nonexistent/pose.jpg"],
    )
    with pytest.raises(SystemExit):
        pose_ingest.main()
