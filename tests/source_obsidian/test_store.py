from unittest.mock import MagicMock, patch
from langchain_core.documents import Document
from source_obsidian.store import ensure_schema, upsert_documents, similarity_search


def _mock_conn() -> MagicMock:
    """Return a MagicMock that behaves as a psycopg connection context manager."""
    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    return conn


@patch("source_obsidian.store.register_vector")
@patch("source_obsidian.store.psycopg.connect")
def test_ensure_schema_creates_extension_and_table(mock_connect, _mock_register):
    conn = _mock_conn()
    mock_connect.return_value = conn
    ensure_schema()
    sql_calls = [str(c.args[0]) for c in conn.execute.call_args_list]
    assert any("CREATE EXTENSION" in s for s in sql_calls)
    assert any("CREATE TABLE" in s for s in sql_calls)
    conn.commit.assert_called_once()


@patch("source_obsidian.store.register_vector")
@patch("source_obsidian.store.psycopg.connect")
def test_upsert_inserts_one_row_per_document(mock_connect, _mock_register):
    conn = _mock_conn()
    mock_connect.return_value = conn
    docs = [
        Document(page_content="doc one", metadata={"source": "a.md"}),
        Document(page_content="doc two", metadata={"source": "b.md"}),
    ]
    embedder = MagicMock()
    embedder.embed_documents.return_value = [[0.1] * 384, [0.2] * 384]
    upsert_documents(docs, embedder)
    assert conn.execute.call_count == len(docs)
    conn.commit.assert_called_once()


@patch("source_obsidian.store.register_vector")
@patch("source_obsidian.store.psycopg.connect")
def test_upsert_passes_source_metadata(mock_connect, _mock_register):
    conn = _mock_conn()
    mock_connect.return_value = conn
    docs = [Document(page_content="content", metadata={"source": "notes.md"})]
    embedder = MagicMock()
    embedder.embed_documents.return_value = [[0.0] * 384]
    upsert_documents(docs, embedder)
    call_args = conn.execute.call_args[0][1]
    assert call_args[0] == "notes.md"


@patch("source_obsidian.store.register_vector")
@patch("source_obsidian.store.psycopg.connect")
def test_similarity_search_returns_documents(mock_connect, _mock_register):
    conn = _mock_conn()
    conn.execute.return_value.fetchall.return_value = [
        ("family recipe", "recipes.md"),
        ("birthday notes", "events.md"),
    ]
    mock_connect.return_value = conn
    embedder = MagicMock()
    embedder.embed_query.return_value = [0.1] * 384
    docs = similarity_search("recipe", embedder, k=2)
    assert len(docs) == 2
    assert docs[0].page_content == "family recipe"
    assert docs[0].metadata["source"] == "recipes.md"
    assert docs[1].metadata["source"] == "events.md"


@patch("source_obsidian.store.register_vector")
@patch("source_obsidian.store.psycopg.connect")
def test_similarity_search_empty_db_returns_empty_list(mock_connect, _mock_register):
    conn = _mock_conn()
    conn.execute.return_value.fetchall.return_value = []
    mock_connect.return_value = conn
    embedder = MagicMock()
    embedder.embed_query.return_value = [0.0] * 384
    assert similarity_search("nothing", embedder) == []


@patch("source_obsidian.store.register_vector")
@patch("source_obsidian.store.psycopg.connect")
def test_dsn_includes_all_postgres_env_vars(mock_connect, _mock_register, monkeypatch):
    monkeypatch.setenv("POSTGRES_HOST", "db.example.com")
    monkeypatch.setenv("POSTGRES_DB", "myvault")
    monkeypatch.setenv("POSTGRES_USER", "myuser")
    monkeypatch.setenv("POSTGRES_PASSWORD", "s3cr3t")
    conn = _mock_conn()
    mock_connect.return_value = conn
    ensure_schema()
    dsn = mock_connect.call_args[0][0]
    assert "db.example.com" in dsn
    assert "myvault" in dsn
    assert "myuser" in dsn
    assert "s3cr3t" in dsn
