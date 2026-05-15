from unittest.mock import patch
from source_obsidian.embedder import get_embedder


@patch("source_obsidian.embedder.SentenceTransformerEmbeddings")
def test_uses_embedding_model_from_env(mock_ste, monkeypatch):
    monkeypatch.setenv("EMBEDDING_MODEL", "custom-model")
    get_embedder()
    mock_ste.assert_called_once_with(model_name="custom-model")


@patch("source_obsidian.embedder.SentenceTransformerEmbeddings")
def test_returns_embedder_instance(mock_ste):
    result = get_embedder()
    assert result is mock_ste.return_value
