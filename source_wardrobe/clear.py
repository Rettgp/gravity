import sys

from dotenv import load_dotenv

from source_wardrobe import store


def main() -> None:
    load_dotenv()
    load_dotenv(".env.local", override=True)

    store.ensure_schema()

    answer = input("This will delete ALL wardrobe items and outfits. Type 'yes' to confirm: ")
    if answer.strip().lower() != "yes":
        print("Aborted.")
        sys.exit(0)

    outfits_deleted, items_deleted = store.clear_all_items()
    print(f"Deleted {outfits_deleted} outfit(s) and {items_deleted} item(s).")


if __name__ == "__main__":
    main()
