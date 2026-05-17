from unittest.mock import patch
from source_obsidian.embedder import get_embedder


@patch("source_obsidian.embedder.HuggingFaceEmbeddings")
def test_uses_embedding_model_from_env(mock_hfe, monkeypatch):
    monkeypatch.setenv("EMBEDDING_MODEL", "custom-model")
    get_embedder()
    mock_hfe.assert_called_once_with(model_name="custom-model")


@patch("source_obsidian.embedder.HuggingFaceEmbeddings")
def test_returns_embedder_instance(mock_hfe):
    result = get_embedder()
    assert result is mock_hfe.return_value
