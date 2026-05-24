# server

FastAPI backend that handles chat requests, runs the agent pipeline, and serves wardrobe images.

## Prerequisites

- PostgreSQL running with data already ingested (see `source_obsidian/` and `source_wardrobe/`)
- Ollama running locally with both models pulled:
  ```bash
  ollama pull llama3:8b-instruct-q4_K_M   # text model for pipeline supervisor
  ollama pull llama3.2-vision:11b          # vision model for wardrobe agent
  ```
- All env vars set (see below)

## Environment variables

| Variable | Description |
|---|---|
| `POSTGRES_HOST` | PostgreSQL host |
| `POSTGRES_PORT` | PostgreSQL port (default `5432`) |
| `POSTGRES_DB` | Database name |
| `POSTGRES_USER` | Database user |
| `POSTGRES_PASSWORD` | Database password |
| `OLLAMA_MODEL` | Text model for the supervisor pipeline (e.g. `llama3:8b-instruct-q4_K_M`) |
| `OLLAMA_VISION_MODEL` | Vision model for the wardrobe agent (e.g. `llama3.2-vision:11b`) |
| `OLLAMA_BASE_URL` | Ollama server URL (default `http://localhost:11434`) |
| `EMBEDDING_MODEL` | Sentence-transformers model for search (default `all-MiniLM-L6-v2`) |
| `WARDROBE_IMAGE_STORE` | Directory where wardrobe images are stored (default `~/.gravity/wardrobe`) |

Set these in a `.env.local` file at the project root.

## Starting the server

```bash
gravity-server
```

Starts on `http://0.0.0.0:8000` with hot-reload enabled. The frontend dev server proxies API requests to this port.

## API reference

### `POST /api/chat`

Send a message and receive an answer from the agent pipeline.

**Request body (JSON):**
```json
{
  "message": "What should Garrett wear to a job interview?",
  "history": [
    { "role": "user",      "content": "previous question" },
    { "role": "assistant", "content": "previous answer"   }
  ],
  "image_base64":    "...",        // optional — base64-encoded image
  "image_media_type": "image/jpeg" // optional — required when image_base64 is set
}
```

`history` and the image fields are optional. When `image_base64` is provided, the vision model describes the image and the description is prepended to the question before it reaches the agent pipeline.

**Response body (JSON):**
```json
{
  "answer": "For a job interview, Garrett's navy suit with the white dress shirt...",
  "sources": ["People/Dad.md", "Recipes/Apple Pie.md"],
  "outfit_items": [
    { "item_id": 1, "label": "Navy slim-fit suit", "image_url": "/api/wardrobe/image/1" },
    { "item_id": 4, "label": "White dress shirt",  "image_url": "/api/wardrobe/image/4" }
  ]
}
```

`sources` is populated for family-doc questions. `outfit_items` is populated for wardrobe questions and contains image URLs the frontend can render directly.

---

### `GET /api/wardrobe/image/{item_id}`

Returns the image file for a wardrobe item. Used by the frontend to render outfit cards.

```
GET /api/wardrobe/image/1
→ 200 image/jpeg  (or 404 if item not found)
```

---

### `GET /api/wardrobe/catalog/{person_label}`

Returns all wardrobe items for a person, with optional filters.

```
GET /api/wardrobe/catalog/garrett
GET /api/wardrobe/catalog/garrett?category=tops
GET /api/wardrobe/catalog/garrett?season=summer&occasion=business
```

**Query parameters:** `category`, `season`, `occasion` (all optional)

**Response:**
```json
{
  "person_label": "garrett",
  "items": [
    {
      "id": 1,
      "image_path": "/home/user/.gravity/wardrobe/garrett/blazer.jpg",
      "description": "Navy slim-fit blazer",
      "category": "outerwear",
      "seasons": ["fall", "winter", "spring"],
      "occasions": ["business", "formal"],
      "colors": ["navy"]
    }
  ]
}
```

## How the pipeline works

```
POST /api/chat
    │
    ▼
chat.py route
    │  (optional) vision model describes attached image
    ▼
Pipeline.ainvoke()                    ← supervisor agent (llama3:8b)
    │
    ├─ search_family_docs(query)       ← family_docs sub-agent → pgvector search
    │                                     returns [source.md] bracketed headers
    │
    └─ wardrobe_assistant(query)       ← wardrobe sub-agent (llama3.2-vision)
                                          tools: get_person_profile
                                                 search_wardrobe_items
                                                 get_wardrobe_catalog
                                          tags recommended items as [ITEMS:1,5,12]

pipeline extracts:
  - [source.md] tags  → sources[]
  - [ITEMS:...]  tags → outfit_items[] (looks up image paths from DB)
```

The supervisor reads `prompts/pipeline.md` and the wardrobe sub-agent reads `prompts/wardrobe.md`. Both use a ReAct (Thought → Tool call → Observation → Final Answer) pattern with few-shot examples.

**Wardrobe questions must include the person's name** so the pipeline routes to the correct catalog (e.g. "What should *Garrett* wear?" not "What should I wear?").

## Module reference

| File | Purpose |
|---|---|
| `main.py` | FastAPI app setup, CORS, router registration, `gravity-server` entry point |
| `pipeline.py` | Supervisor `Pipeline` class, source/item extraction, `wardrobe_assistant` tool |
| `routes/chat.py` | `POST /api/chat` handler |
| `routes/wardrobe.py` | `GET /api/wardrobe/image/{id}` and `GET /api/wardrobe/catalog/{person}` |
