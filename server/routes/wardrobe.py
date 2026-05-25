import asyncio
import json
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from agents.wardrobe import run_agent
from server.pipeline import build_outfit_items
from source_wardrobe.store import (
    get_all_persons,
    get_catalog,
    get_daily_pick,
    get_items_by_ids,
    update_item_fields,
    upsert_daily_pick,
)

router = APIRouter()


class OutfitRequest(BaseModel):
    person_label: str
    weather_summary: str


def _extract_ids_from_text(text: str) -> list[int]:
    """Parse [ITEMS:id,...] tags out of a plain agent-response string."""
    ids: list[int] = []
    seen: set[int] = set()
    for match in re.finditer(r"\[ITEMS:([\d,]+)\]", text):
        for raw in match.group(1).split(","):
            raw = raw.strip()
            if raw.isdigit():
                item_id = int(raw)
                if item_id not in seen:
                    seen.add(item_id)
                    ids.append(item_id)
    return ids


@router.post("/outfit/stream")
async def outfit_stream(req: OutfitRequest) -> StreamingResponse:
    """SSE stream for dashboard outfit recommendations.

    person_label is a typed field — the query is constructed here so the
    person's name is guaranteed to be present, bypassing the chat supervisor.

    Events match the chat stream format:
    - ``{"type": "step", ...}``
    - ``{"type": "result", "answer": "...", "sources": [], "outfit_items": [...]}``
    - ``{"type": "error", "message": "..."}``
    """
    person_label = req.person_label.strip().lower()
    query = (
        f"What should {person_label} wear today? "
        f"Today's weather: {req.weather_summary}."
    )

    async def generate():
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[dict] = asyncio.Queue()

        def on_step(event: dict) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, event)

        async def _run() -> None:
            try:
                result = await asyncio.to_thread(
                    run_agent, query, person_label=person_label, on_step=on_step
                )
                outfit_items = build_outfit_items(_extract_ids_from_text(result))
                loop.call_soon_threadsafe(queue.put_nowait, {
                    "type": "result",
                    "answer": result,
                    "sources": [],
                    "outfit_items": outfit_items,
                })
            except Exception as exc:
                loop.call_soon_threadsafe(queue.put_nowait, {
                    "type": "error",
                    "message": str(exc),
                })

        task = asyncio.create_task(_run())
        while True:
            event = await queue.get()
            yield f"data: {json.dumps(event)}\n\n"
            if event["type"] in ("result", "error"):
                break
        await task

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/image/{item_id}")
async def get_wardrobe_image(item_id: int) -> FileResponse:
    """Serve the image file for a wardrobe item."""
    items = get_items_by_ids([item_id])
    if not items:
        raise HTTPException(status_code=404, detail="Item not found")
    image_path = items[0]["image_path"]
    return FileResponse(image_path)


@router.get("/daily-pick/{person_label}")
async def get_today_pick(person_label: str) -> dict:
    """Return today's saved outfit pick, or 404 if none exists yet."""
    pick = get_daily_pick(person_label.lower())
    if not pick:
        raise HTTPException(status_code=404, detail="No pick for today")
    items = get_items_by_ids(pick["item_ids"])
    outfit_items = [
        {"item_id": item["id"], "label": item["description"], "image_url": f"/api/wardrobe/image/{item['id']}"}
        for item in items
    ]
    return {"outfit_items": outfit_items, "answer": pick["answer"]}


class DailyPickRequest(BaseModel):
    item_ids: list[int]
    answer: str


@router.post("/daily-pick/{person_label}")
async def save_today_pick(person_label: str, req: DailyPickRequest) -> dict:
    """Persist (or overwrite) today's outfit pick for a person."""
    upsert_daily_pick(person_label.lower(), req.item_ids, req.answer)
    return {"ok": True}


@router.get("/persons")
async def list_persons() -> dict:
    """Return all people registered in the wardrobe."""
    return {"persons": get_all_persons()}


class ItemUpdateRequest(BaseModel):
    description: str | None = None
    colors: list[str] | None = None
    category: str | None = None


@router.patch("/items/{item_id}")
async def update_item(item_id: int, req: ItemUpdateRequest) -> dict:
    """Update description, colors, and/or category for a wardrobe item."""
    updated = update_item_fields(item_id, req.description, req.colors, req.category)
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


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
