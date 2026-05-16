import os
import numpy as np
import psycopg
from pgvector.psycopg import register_vector
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

_CREATE_EXTENSION = "CREATE EXTENSION IF NOT EXISTS vector"
_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS documents (
    id          SERIAL PRIMARY KEY,
    source_file TEXT,
    chunk_index INT,
    content     TEXT,
    embedding   VECTOR(384),
    created_at  TIMESTAMP DEFAULT NOW()
)
"""


def _dsn() -> str:
    return (
        f"host={os.environ['POSTGRES_HOST']} "
        f"port={os.environ['POSTGRES_PORT']} "
        f"dbname={os.environ['POSTGRES_DB']} "
        f"user={os.environ['POSTGRES_USER']} "
        f"password={os.environ['POSTGRES_PASSWORD']}"
    )


def _connect() -> psycopg.Connection:
    conn = psycopg.connect(_dsn())
    register_vector(conn)
    return conn


def ensure_schema() -> None:
    conn = psycopg.connect(_dsn())
    with conn:
        conn.execute(_CREATE_EXTENSION)
        conn.commit()
        register_vector(conn)
        conn.execute(_CREATE_TABLE)
        conn.commit()
    conn.close()


def upsert_documents(docs: list[Document], embedder: Embeddings) -> None:
    texts = [d.page_content for d in docs]
    vectors = embedder.embed_documents(texts)

    with _connect() as conn:
        for i, (doc, vec) in enumerate(zip(docs, vectors)):
            conn.execute(
                "INSERT INTO documents (source_file, chunk_index, content, embedding) "
                "VALUES (%s, %s, %s, %s)",
                (doc.metadata.get("source"), i, doc.page_content, np.array(vec)),
            )
        conn.commit()


def similarity_search(query: str, embedder: Embeddings, k: int = 5) -> list[Document]:
    vec = np.array(embedder.embed_query(query))
    with _connect() as conn:
        rows = conn.execute(
            "SELECT content, source_file FROM documents "
            "ORDER BY embedding <-> %s LIMIT %s",
            (vec, k),
        ).fetchall()

    return [Document(page_content=row[0], metadata={"source": row[1]}) for row in rows]
