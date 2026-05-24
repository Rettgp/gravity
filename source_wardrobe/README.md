# source_wardrobe

Ingests clothing images and pose photos into PostgreSQL for the wardrobe assistant agent. Uses a local vision model (via Ollama) to automatically describe each item and stores vector embeddings for semantic search.

## Prerequisites

- PostgreSQL running with the `pgvector` extension available (shared with `source_obsidian`)
- Ollama running locally with a vision-capable model pulled:
  ```bash
  ollama pull llama3.2-vision:11b
  ```
- All env vars set (see below)

## Environment variables

| Variable               | Description                                                                  |
| ---------------------- | ---------------------------------------------------------------------------- |
| `POSTGRES_HOST`        | PostgreSQL host                                                              |
| `POSTGRES_PORT`        | PostgreSQL port (default `5432`)                                             |
| `POSTGRES_DB`          | Database name                                                                |
| `POSTGRES_USER`        | Database user                                                                |
| `POSTGRES_PASSWORD`    | Database password                                                            |
| `OLLAMA_BASE_URL`      | Ollama server URL (default `http://localhost:11434`)                         |
| `OLLAMA_VISION_MODEL`  | Vision model name (default `llama3.2-vision:11b`)                            |
| `EMBEDDING_MODEL`      | Sentence-transformers model for text embeddings (default `all-MiniLM-L6-v2`) |
| `WARDROBE_IMAGE_STORE` | Directory where copied images are stored (default `~/.gravity/wardrobe`)     |

Set these in a `.env.local` file at the project root.

## Ingesting a wardrobe

Point the CLI at a directory of clothing photos. A `--person` label is required so multiple family members can each have their own catalog.

```bash
gravity-wardrobe-ingest --person garrett --dir ~/Pictures/clothes/garrett/
```

If the person label doesn't exist yet, it is created automatically with a display name derived from the label. To set a custom display name:

```bash
gravity-wardrobe-ingest --person garrett --dir ~/Pictures/clothes/ --display-name "Garrett"
```

**What happens:**

1. Creates the wardrobe schema (if not already present)
2. Creates the person record (if new)
3. Copies each image to `$WARDROBE_IMAGE_STORE/{person}/`
4. Calls the vision model to describe the item — returns category, colors, seasons, occasions, and a one-sentence description
5. Embeds the description text and upserts the item into `wardrobe_items`

Re-running is safe — `image_path` is the upsert key, so existing items are updated, not duplicated.

**Supported image formats:** `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`

## Ingesting a pose photo

A pose photo lets the agent factor in body type, build, and skin tone when recommending colors and cuts.

```bash
gravity-wardrobe-pose --person garrett --image ~/Pictures/me.jpg
```

The vision model describes the person's physical appearance (build, height impression, skin tone, posture notes) and saves it alongside the person record. Re-running with a new image overwrites the previous description.

## Schema

```sql
wardrobe_persons (
  label            TEXT PRIMARY KEY,   -- e.g. "garrett"
  display_name     TEXT,
  pose_image_path  TEXT,               -- local path to pose photo
  pose_description TEXT,               -- vision model's description
  created_at       TIMESTAMP
)

wardrobe_items (
  id           SERIAL PRIMARY KEY,
  person_label TEXT REFERENCES wardrobe_persons(label),
  image_path   TEXT UNIQUE,            -- local path (upsert key)
  description  TEXT,                   -- one-sentence vision description
  category     TEXT,                   -- tops/bottoms/shoes/outerwear/accessories/dress/suit
  seasons      TEXT[],                 -- {spring,summer,fall,winter}
  occasions    TEXT[],                 -- {casual,business,formal,athletic,relax}
  colors       TEXT[],
  embedding    VECTOR(384),
  created_at   TIMESTAMP
)

wardrobe_outfits (
  id           SERIAL PRIMARY KEY,
  person_label TEXT REFERENCES wardrobe_persons(label),
  name         TEXT,                   -- e.g. "Monday Business Casual"
  item_ids     INT[],
  occasion     TEXT,
  season       TEXT,
  created_at   TIMESTAMP
)
```

## Module reference

| File             | Purpose                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ingest.py`      | `gravity-wardrobe-ingest` entry point — copies images, calls vision model, stores items                                    |
| `pose_ingest.py` | `gravity-wardrobe-pose` entry point — copies pose photo, stores person description                                         |
| `vision.py`      | Ollama vision model wrapper: `describe_clothing_item()`, `describe_person_pose()`, `describe_image()`                      |
| `store.py`       | All DB operations: `ensure_schema()`, `upsert_person/item/pose()`, `search_items()`, `get_catalog()`, `get_items_by_ids()` |

## Notes

- The pose photo is used for **text-based fit recommendations** (e.g. "slim-fit cuts suit an athletic build").
- The vision model is called **once per image at ingest time**. Descriptions are stored as text, so the lightweight text model handles all outfit reasoning queries at runtime.
