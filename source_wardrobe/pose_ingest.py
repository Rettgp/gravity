import argparse
import os
import shutil
from pathlib import Path

from dotenv import load_dotenv

from source_wardrobe import store, vision


def _image_store() -> Path:
    base = os.environ.get("WARDROBE_IMAGE_STORE", str(Path.home() / ".gravity" / "wardrobe"))
    return Path(base)


def main() -> None:
    load_dotenv()
    load_dotenv(".env.local", override=True)

    parser = argparse.ArgumentParser(description="Ingest a pose photo for wardrobe fitting")
    parser.add_argument("--person", required=True, help="Person label (e.g. 'garrett')")
    parser.add_argument("--image", required=True, help="Path to the pose photo")
    parser.add_argument(
        "--display-name", help="Display name (only needed when creating a new person)"
    )
    args = parser.parse_args()

    label = args.person.lower().strip()
    image_path = Path(args.image)

    if not image_path.is_file():
        raise SystemExit(f"Image not found: {image_path}")

    store.ensure_schema()

    if not store.person_exists(label):
        display_name = args.display_name or label.capitalize()
        store.upsert_person(label, display_name)
        print(f"Created person: {display_name} ({label})")

    dest_dir = _image_store() / label
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"pose{image_path.suffix.lower()}"
    shutil.copy2(image_path, dest)

    print(f"Analyzing pose photo for '{label}' ...")
    description = vision.describe_person_pose(str(dest))
    store.upsert_pose(label, str(dest), description)
    print(f"Pose description saved:\n{description}")


if __name__ == "__main__":
    main()
