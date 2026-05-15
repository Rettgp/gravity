# Gravity

![Gravity Logo](gravity_logo.png)

**Gravity** is a local-first, AI-powered home assistant that turns your private family knowledge base into a conversational interface — no cloud AI required.

---

## What It Does

Gravity connects to your [Obsidian](https://obsidian.md) vault stored in S3, chunks and embeds your markdown notes, and lets you ask natural-language questions against that knowledge using a fully local LLM. Everything runs on your own hardware; your family's data never leaves your network.

---

## Architecture

```
React Frontend
      ↓
FastAPI Backend
      ↓
RAG Pipeline
   ├── S3 Obsidian Vault
   ├── Chunking & Embeddings (sentence-transformers)
   ├── Vector Retrieval (PostgreSQL + pgvector)
   ├── Prompt Builder
   └── Local LLM (Ollama)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React |
| Backend API | FastAPI + Uvicorn |
| Embeddings | `all-MiniLM-L6-v2` via sentence-transformers |
| Vector Store | PostgreSQL + pgvector |
| Local LLM | Ollama (`llama3:8b-instruct-q4_K_M`) |
| Document Source | AWS S3 (Obsidian markdown vault) |

---

## Getting Started

### Prerequisites

- Python 3.11+
- Docker (for PostgreSQL + pgvector)
- [Ollama](https://ollama.com) installed and running
- AWS credentials with S3 read access

### 1 — Start the local LLM

```bash
ollama pull llama3:8b-instruct-q4_K_M
ollama serve
```

### 2 — Start PostgreSQL + pgvector

```bash
docker run -d \
  --name pgvector \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  ankane/pgvector
```

Then create the schema:

```sql
CREATE EXTENSION vector;

CREATE TABLE documents (
    id           SERIAL PRIMARY KEY,
    source_file  TEXT,
    chunk_index  INT,
    content      TEXT,
    embedding    VECTOR(384),
    created_at   TIMESTAMP DEFAULT NOW()
);
```

### 3 — Install Python dependencies

```bash
pip install fastapi uvicorn psycopg2-binary sqlalchemy pgvector \
            sentence-transformers boto3 requests python-dotenv
```

### 4 — Configure environment

Create a `.env` file:

```env
S3_BUCKET=your-obsidian-vault-bucket
AWS_REGION=us-east-1
POSTGRES_DSN=postgresql://postgres:password@localhost:5432/postgres
OLLAMA_URL=http://localhost:11434
```

### 5 — Ingest your vault

```bash
python ingest.py
```

### 6 — Start the API

```bash
uvicorn main:app --reload
```

### 7 — Open the UI

```bash
cd frontend && npm install && npm run dev
```

Navigate to `http://localhost:5173`.

---

## Project Phases

| Phase | Status | Description |
|---|---|---|
| 1 | Environment Setup | Ollama, PostgreSQL, pgvector |
| 2 | S3 Loader | Pull markdown files from Obsidian S3 vault |
| 3 | Chunking & Embeddings | Split docs, generate vectors |
| 4 | Retrieval | pgvector similarity search |
| 5 | LLM Integration | Ollama prompt construction & response |
| 6 | FastAPI Backend | `/chat` endpoint wiring it all together |
| 7 | React Frontend | Chat UI with source citations |

---

## Planned Enhancements

- Supervisor agent for multi-step reasoning
- Homebridge integration for smart home control
- Hybrid retrieval (BM25 + vector)
- Cross-encoder reranking
- Voice input / output
- Mobile app

---

## License

[MIT](LICENSE)
