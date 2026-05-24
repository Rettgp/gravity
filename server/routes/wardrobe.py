from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from source_wardrobe.store import get_catalog, get_items_by_ids

router = APIRouter()


@router.get("/image/{item_id}")
async def get_wardrobe_image(item_id: int) -> FileResponse:
    """Serve the image file for a wardrobe item."""
    items = get_items_by_ids([item_id])
    if not items:
        raise HTTPException(status_code=404, detail="Item not found")
    image_path = items[0]["image_path"]
    return FileResponse(image_path)


@router.get("/catalog/{person_label}")
async def list_catalog(
    person_label: str,
    category: str | None = None,
    season: str | None = None,
    occasion: str | None = None,
) -> dict:
    """Return all wardrobe items for a person, with optional filters."""
    items = get_catalog(person_label.lower(), category=category, season=season, occasion=occasion)
    return {"person_label": person_label, "items": items}
