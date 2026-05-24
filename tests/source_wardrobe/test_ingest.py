import argparse
from pathlib import Path
from unittest.mock import MagicMock, call, patch

import pytest

from source_wardrobe import ingest


@pytest.fixture
def fake_image_dir(tmp_path):
    img = tmp_path / "shirt.jpg"
    img.write_bytes(b"fake image data")
    return tmp_path


@patch("source_wardrobe.ingest.store.upsert_item")
@patch("source_wardrobe.ingest.store.upsert_person")
@patch("source_wardrobe.ingest.store.person_exists", return_value=False)
@patch("source_wardrobe.ingest.store.ensure_schema")
@patch("source_wardrobe.ingest.vision.describe_clothing_item")
@patch("source_wardrobe.ingest.get_embedder")
@patch("source_wardrobe.ingest._image_store")
def test_ingest_creates_person_when_not_exists(
    mock_store_path,
    mock_get_embedder,
    mock_describe,
    mock_schema,
    mock_exists,
    mock_upsert_person,
    mock_upsert_item,
    fake_image_dir,
    tmp_path,
    monkeypatch,
):
    mock_store_path.return_value = tmp_path / "wardrobe"
    mock_describe.return_value = {
        "category": "tops",
        "colors": ["white"],
        "seasons": ["spring"],
        "occasions": ["casual"],
        "description": "White t-shirt.",
    }
    embedder = MagicMock()
    embedder.embed_query.return_value = [0.1] * 384
    mock_get_embedder.return_value = embedder

    monkeypatch.setattr(
        "sys.argv",
        ["gravity-wardrobe-ingest", "--person", "garrett", "--dir", str(fake_image_dir)],
    )
    ingest.main()

    mock_upsert_person.assert_called_once_with("garrett", "Garrett")


@patch("source_wardrobe.ingest.store.upsert_item")
@patch("source_wardrobe.ingest.store.upsert_person")
@patch("source_wardrobe.ingest.store.person_exists", return_value=True)
@patch("source_wardrobe.ingest.store.ensure_schema")
@patch("source_wardrobe.ingest.vision.describe_clothing_item")
@patch("source_wardrobe.ingest.get_embedder")
@patch("source_wardrobe.ingest._image_store")
def test_ingest_skips_person_creation_when_exists(
    mock_store_path,
    mock_get_embedder,
    mock_describe,
    mock_schema,
    mock_exists,
    mock_upsert_person,
    mock_upsert_item,
    fake_image_dir,
    tmp_path,
    monkeypatch,
):
    mock_store_path.return_value = tmp_path / "wardrobe"
    mock_describe.return_value = {
        "category": "tops", "colors": [], "seasons": [], "occasions": [],
        "description": "A shirt.",
    }
    embedder = MagicMock()
    embedder.embed_query.return_value = [0.0] * 384
    mock_get_embedder.return_value = embedder

    monkeypatch.setattr(
        "sys.argv",
        ["gravity-wardrobe-ingest", "--person", "garrett", "--dir", str(fake_image_dir)],
    )
    ingest.main()

    mock_upsert_person.assert_not_called()


@patch("source_wardrobe.ingest.store.upsert_item")
@patch("source_wardrobe.ingest.store.upsert_person")
@patch("source_wardrobe.ingest.store.person_exists", return_value=True)
@patch("source_wardrobe.ingest.store.ensure_schema")
@patch("source_wardrobe.ingest.vision.describe_clothing_item")
@patch("source_wardrobe.ingest.get_embedder")
@patch("source_wardrobe.ingest._image_store")
def test_ingest_calls_upsert_item_for_each_image(
    mock_store_path,
    mock_get_embedder,
    mock_describe,
    mock_schema,
    mock_exists,
    mock_upsert_person,
    mock_upsert_item,
    fake_image_dir,
    tmp_path,
    monkeypatch,
):
    mock_store_path.return_value = tmp_path / "wardrobe"
    meta = {
        "category": "tops", "colors": ["blue"], "seasons": ["spring"],
        "occasions": ["casual"], "description": "Blue polo.",
    }
    mock_describe.return_value = meta
    embedder = MagicMock()
    embedder.embed_query.return_value = [0.1] * 384
    mock_get_embedder.return_value = embedder

    monkeypatch.setattr(
        "sys.argv",
        ["gravity-wardrobe-ingest", "--person", "garrett", "--dir", str(fake_image_dir)],
    )
    ingest.main()

    mock_upsert_item.assert_called_once()
    call_kwargs = mock_upsert_item.call_args[1]
    assert call_kwargs["person_label"] == "garrett"
    assert call_kwargs["description"] == "Blue polo."


def test_ingest_exits_when_dir_not_found(monkeypatch):
    monkeypatch.setattr(
        "sys.argv",
        ["gravity-wardrobe-ingest", "--person", "garrett", "--dir", "/nonexistent/path"],
    )
    with pytest.raises(SystemExit):
        ingest.main()


@patch("source_wardrobe.ingest.store.upsert_item")
@patch("source_wardrobe.ingest.store.upsert_person")
@patch("source_wardrobe.ingest.store.person_exists", return_value=True)
@patch("source_wardrobe.ingest.store.ensure_schema")
@patch("source_wardrobe.ingest.vision.describe_clothing_item")
@patch("source_wardrobe.ingest.get_embedder")
@patch("source_wardrobe.ingest._image_store")
def test_ingest_skips_item_on_vision_error(
    mock_store_path,
    mock_get_embedder,
    mock_describe,
    mock_schema,
    mock_exists,
    mock_upsert_person,
    mock_upsert_item,
    fake_image_dir,
    tmp_path,
    monkeypatch,
):
    mock_store_path.return_value = tmp_path / "wardrobe"
    mock_describe.side_effect = RuntimeError("vision model unavailable")
    embedder = MagicMock()
    mock_get_embedder.return_value = embedder

    monkeypatch.setattr(
        "sys.argv",
        ["gravity-wardrobe-ingest", "--person", "garrett", "--dir", str(fake_image_dir)],
    )
    ingest.main()  # should not raise

    mock_upsert_item.assert_not_called()
