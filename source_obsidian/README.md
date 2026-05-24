# source_obsidian

Pulls markdown notes from an S3 bucket (your Obsidian vault sync), embeds them with a sentence-transformer model, and stores them in PostgreSQL with pgvector for semantic search.

## Prerequisites

- PostgreSQL running with the `pgvector` extension available
- AWS credentials configured (via `~/.aws/credentials`, env vars, or IAM role)
- An S3 bucket containing your Obsidian vault as `.md` files
- All env vars set (see below)

## Environment variables

| Variable | Description |
|---|---|
| `POSTGRES_HOST` | PostgreSQL host |
| `POSTGRES_PORT` | PostgreSQL port (default `5432`) |
| `POSTGRES_DB` | Database name |
| `POSTGRES_USER` | Database user |
| `POSTGRES_PASSWORD` | Database password |
| `S3_BUCKET` | S3 bucket name containing the Obsidian vault |
| `AWS_REGION` | AWS region of the bucket |
| `EMBEDDING_MODEL` | Sentence-transformers model name (default `all-MiniLM-L6-v2`) |

Set these in a `.env.local` file at the project root (this file is gitignored).

## Running ingestion

```bash
gravity-ingest
```

This will:
1. Connect to S3 and download every `.md` file from the bucket
2. Create the `documents` table in PostgreSQL (if it doesn't exist)
3. Embed each document's text and insert it into the table

Re-running ingestion appends new rows — it does not deduplicate. If you want a clean re-ingest, truncate the `documents` table first:

```sql
TRUNCATE TABLE documents;
```

## Schema

```sql
documents (
  id          SERIAL PRIMARY KEY,
  source_file TEXT,        -- S3 key, e.g. "Recipes/Apple Pie.md"
  chunk_index INT,
  content     TEXT,
  embedding   VECTOR(384),
  created_at  TIMESTAMP
)
```

## Module reference

| File | Purpose |
|---|---|
| `ingest.py` | Entry point — orchestrates load → schema → embed → store |
| `loader.py` | Downloads `.md` files from S3, returns `Document` objects |
| `embedder.py` | Initialises the HuggingFace sentence-transformer embedder |
| `store.py` | `ensure_schema()`, `upsert_documents()`, `similarity_search()` |
