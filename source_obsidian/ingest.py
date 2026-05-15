import os
from dotenv import load_dotenv

from source_obsidian.loader import load_from_s3
from source_obsidian.embedder import get_embedder
from source_obsidian.store import ensure_schema, upsert_documents


def main() -> None:
    load_dotenv()
    load_dotenv(".env.local", override=True)

    bucket = os.environ["S3_BUCKET"]
    print(f"Loading documents from s3://{bucket} ...")
    docs = load_from_s3(bucket)
    print(f"  Loaded {len(docs)} markdown files")

    print("Ensuring database schema ...")
    ensure_schema()

    embedder = get_embedder()
    print("Embedding and storing documents ...")
    upsert_documents(docs, embedder)
    print("Done.")


if __name__ == "__main__":
    main()
