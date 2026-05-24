import os

import numpy as np
import psycopg
from pgvector.psycopg import register_vector

_CREATE_PERSONS = """
CREATE TABLE IF NOT EXISTS wardrobe_persons (
    label            TEXT PRIMARY KEY,
    display_name     TEXT NOT NULL,
    pose_image_path  TEXT,
    pose_description TEXT,
    created_at       TIMESTAMP DEFAULT NOW()
)
"""

_CREATE_ITEMS = """
CREATE TABLE IF NOT EXISTS wardrobe_items (
    id           SERIAL PRIMARY KEY,
    person_label TEXT NOT NULL REFERENCES wardrobe_persons(label),
    image_path   TEXT NOT NULL UNIQUE,
    description  TEXT NOT NULL,
    category     TEXT,
    seasons      TEXT[],
    occasions    TEXT[],
    colors       TEXT[],
    embedding    VECTOR(384),
    created_at   TIMESTAMP DEFAULT NOW()
)
"""

_CREATE_OUTFITS = """
CREATE TABLE IF NOT EXISTS wardrobe_outfits (
    id           SERIAL PRIMARY KEY,
    person_label TEXT NOT NULL REFERENCES wardrobe_persons(label),
    name         TEXT,
    item_ids     INT[],
    occasion     TEXT,
    season       TEXT,
    created_at   TIMESTAMP DEFAULT NOW()
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
        conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        conn.commit()
        register_vector(conn)
        conn.execute(_CREATE_PERSONS)
        conn.execute(_CREATE_ITEMS)
        conn.execute(_CREATE_OUTFITS)
        conn.commit()
    conn.close()


def upsert_person(label: str, display_name: str) -> None:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO wardrobe_persons (label, display_name)
            VALUES (%s, %s)
            ON CONFLICT (label) DO UPDATE SET display_name = EXCLUDED.display_name
            """,
            (label, display_name),
        )
        conn.commit()


def upsert_pose(label: str, image_path: str, description: str) -> None:
    with _connect() as conn:
        conn.execute(
            """
            UPDATE wardrobe_persons
            SET pose_image_path = %s, pose_description = %s
            WHERE label = %s
            """,
            (image_path, description, label),
        )
        conn.commit()


def person_exists(label: str) -> bool:
    with _connect() as conn:
        row = conn.execute(
            "SELECT 1 FROM wardrobe_persons WHERE label = %s", (label,)
        ).fetchone()
    return row is not None


def get_person(label: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT label, display_name, pose_image_path, pose_description "
            "FROM wardrobe_persons WHERE label = %s",
            (label,),
        ).fetchone()
    if not row:
        return None
    return {
        "label": row[0],
        "display_name": row[1],
        "pose_image_path": row[2],
        "pose_description": row[3],
    }


def upsert_item(
    person_label: str,
    image_path: str,
    description: str,
    category: str | None,
    seasons: list[str],
    occasions: list[str],
    colors: list[str],
    embedding: list[float],
) -> int:
    with _connect() as conn:
        row = conn.execute(
            """
            INSERT INTO wardrobe_items
              (person_label, image_path, description, category, seasons, occasions, colors, embedding)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (image_path) DO UPDATE SET
              description = EXCLUDED.description,
              category    = EXCLUDED.category,
              seasons     = EXCLUDED.seasons,
              occasions   = EXCLUDED.occasions,
              colors      = EXCLUDED.colors,
              embedding   = EXCLUDED.embedding
            RETURNING id
            """,
            (
                person_label,
                image_path,
                description,
                category,
                seasons,
                occasions,
                colors,
                np.array(embedding),
            ),
        ).fetchone()
        conn.commit()
    return row[0]


def search_items(
    person_label: str,
    query_embedding: list[float],
    seasons: list[str] | None = None,
    occasions: list[str] | None = None,
    k: int = 10,
) -> list[dict]:
    filters = ["person_label = %s"]
    params: list = [person_label]
    if seasons:
        filters.append("seasons && %s::text[]")
        params.append(seasons)
    if occasions:
        filters.append("occasions && %s::text[]")
        params.append(occasions)
    where = " AND ".join(filters)
    params.extend([np.array(query_embedding), k])
    with _connect() as conn:
        rows = conn.execute(
            f"""
            SELECT id, image_path, description, category, seasons, occasions, colors
            FROM wardrobe_items
            WHERE {where}
            ORDER BY embedding <-> %s
            LIMIT %s
            """,
            params,
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_catalog(
    person_label: str,
    category: str | None = None,
    season: str | None = None,
    occasion: str | None = None,
) -> list[dict]:
    filters = ["person_label = %s"]
    params: list = [person_label]
    if category:
        filters.append("category = %s")
        params.append(category)
    if season:
        filters.append("%s = ANY(seasons)")
        params.append(season)
    if occasion:
        filters.append("%s = ANY(occasions)")
        params.append(occasion)
    where = " AND ".join(filters)
    with _connect() as conn:
        rows = conn.execute(
            f"""
            SELECT id, image_path, description, category, seasons, occasions, colors
            FROM wardrobe_items
            WHERE {where}
            ORDER BY category, id
            """,
            params,
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_items_by_ids(item_ids: list[int]) -> list[dict]:
    if not item_ids:
        return []
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, image_path, description, category, seasons, occasions, colors, person_label
            FROM wardrobe_items
            WHERE id = ANY(%s)
            ORDER BY category
            """,
            (item_ids,),
        ).fetchall()
    return [{**_row_to_dict(r[:7]), "person_label": r[7]} for r in rows]


def _row_to_dict(row) -> dict:
    return {
        "id": row[0],
        "image_path": row[1],
        "description": row[2],
        "category": row[3],
        "seasons": list(row[4]) if row[4] else [],
        "occasions": list(row[5]) if row[5] else [],
        "colors": list(row[6]) if row[6] else [],
    }
