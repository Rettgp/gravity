import pytest


@pytest.fixture(autouse=True)
def env_vars(monkeypatch):
    """Set required environment variables for all tests."""
    monkeypatch.setenv("OLLAMA_MODEL", "test-model")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://localhost:11434")
    monkeypatch.setenv("EMBEDDING_MODEL", "test-embedding-model")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.setenv("POSTGRES_HOST", "localhost")
    monkeypatch.setenv("POSTGRES_PORT", "5432")
    monkeypatch.setenv("POSTGRES_DB", "gravity")
    monkeypatch.setenv("POSTGRES_USER", "gravity")
    monkeypatch.setenv("POSTGRES_PASSWORD", "testpassword")
    monkeypatch.setenv("S3_BUCKET", "test-bucket")
