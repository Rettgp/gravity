import argparse
import os
import shutil
from pathlib import Path

from dotenv import load_dotenv

from source_obsidian.embedder import get_embedder
from source_wardrobe import store, vision

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _image_store() -> Path:
    base = os.environ.get("WARDROBE_IMAGE_STORE", str(Path.home() / ".gravity" / "wardrobe"))
    return Path(base)


def main() -> None:
    load_dotenv()
    load_dotenv(".env.local", override=True)

    parser = argparse.ArgumentParser(description="Ingest wardrobe images for a person")
    parser.add_argument("--person", required=True, help="Person label (e.g. 'garrett')")
    parser.add_argument("--dir", required=True, help="Directory containing clothing images")
    parser.add_argument(
        "--display-name", help="Display name (only needed when creating a new person)"
    )
    args = parser.parse_args()

    label = args.person.lower().strip()
    source_dir = Path(args.dir)

    if not source_dir.is_dir():
        raise SystemExit(f"Directory not found: {source_dir}")

    store.ensure_schema()

    if not store.person_exists(label):
        display_name = args.display_name or label.capitalize()
        store.upsert_person(label, display_name)
        print(f"Created person: {display_name} ({label})")

    dest_dir = _image_store() / label
    dest_dir.mkdir(parents=True, exist_ok=True)

    images = [p for p in source_dir.iterdir() if p.suffix.lower() in _IMAGE_EXTENSIONS]
    if not images:
        print(f"No images found in {source_dir}")
        return

    embedder = get_embedder()
    print(f"Ingesting {len(images)} images for '{label}' ...")
    ingested = 0
    for img in images:
        dest = dest_dir / img.name
        shutil.copy2(img, dest)
        try:
            meta = vision.describe_clothing_item(str(dest))
        except Exception as exc:
            print(f"  [WARN] Could not describe {img.name}: {exc}")
            continue

        description = meta.get("description") or img.stem
        embedding = embedder.embed_query(description)
        store.upsert_item(
            person_label=label,
            image_path=str(dest),
            description=description,
            category=meta.get("category"),
            seasons=meta.get("seasons", []),
            occasions=meta.get("occasions", []),
            colors=meta.get("colors", []),
            embedding=embedding,
        )
        ingested += 1
        print(f"  {img.name}: {meta.get('category', '?')} — {description[:60]}")

    print(f"Done. Ingested {ingested}/{len(images)} items for '{label}'.")


if __name__ == "__main__":
    main()
