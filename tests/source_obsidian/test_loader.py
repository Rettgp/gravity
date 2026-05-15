from unittest.mock import MagicMock, patch
from source_obsidian.loader import load_from_s3


def _make_s3_client(keys_and_bodies: dict[str, str]) -> MagicMock:
    client = MagicMock()
    client.get_paginator.return_value.paginate.return_value = [
        {"Contents": [{"Key": k} for k in keys_and_bodies]}
    ]
    client.get_object.side_effect = lambda Bucket, Key: {
        "Body": MagicMock(read=lambda: keys_and_bodies[Key].encode())
    }
    return client


@patch("source_obsidian.loader.boto3.client")
def test_filters_to_markdown_only(mock_boto3):
    mock_boto3.return_value = _make_s3_client({
        "vault/note.md": "# Note",
        "vault/image.png": "binary",
        "vault/daily.md": "# Daily",
    })
    docs = load_from_s3("test-bucket")
    assert len(docs) == 2
    assert all(d.metadata["source"].endswith(".md") for d in docs)


@patch("source_obsidian.loader.boto3.client")
def test_sets_source_metadata_to_s3_key(mock_boto3):
    mock_boto3.return_value = _make_s3_client({"vault/note.md": "content"})
    docs = load_from_s3("test-bucket")
    assert docs[0].metadata["source"] == "vault/note.md"


@patch("source_obsidian.loader.boto3.client")
def test_page_content_matches_file_body(mock_boto3):
    mock_boto3.return_value = _make_s3_client({"a.md": "# Hello world"})
    docs = load_from_s3("test-bucket")
    assert docs[0].page_content == "# Hello world"


@patch("source_obsidian.loader.boto3.client")
def test_empty_bucket_returns_empty_list(mock_boto3):
    client = MagicMock()
    client.get_paginator.return_value.paginate.return_value = [{"Contents": []}]
    mock_boto3.return_value = client
    assert load_from_s3("test-bucket") == []


@patch("source_obsidian.loader.boto3.client")
def test_uses_aws_region_from_env(mock_boto3, monkeypatch):
    monkeypatch.setenv("AWS_REGION", "eu-west-1")
    client = MagicMock()
    client.get_paginator.return_value.paginate.return_value = [{"Contents": []}]
    mock_boto3.return_value = client
    load_from_s3("test-bucket")
    mock_boto3.assert_called_once_with("s3", region_name="eu-west-1")
