import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from server.pipeline import pipeline
from source_wardrobe.vision import describe_image

router = APIRouter()


class OutfitItem(BaseModel):
    item_id: int
    label: str
    image_url: str
    person_label: str = ""


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []
    image_base64: str | None = None
    image_media_type: str | None = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[str]
    outfit_items: list[OutfitItem] = []


def _image_description(req: ChatRequest) -> str | None:
    if not req.image_base64:
        return None
    try:
        return describe_image(req.image_base64)
    except Exception:
        return None


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    """Server-Sent Events stream of reasoning steps + final answer.

    Each line is ``data: <json>\\n\\n``.  Event types:
    - ``{"type": "step", "step_type": "thought"|"action"|"observation", ...}``
    - ``{"type": "result", "answer": "...", "sources": [...], "outfit_items": [...]}``
    - ``{"type": "error", "message": "..."}``
    """
    state = {
        "question": req.message,
        "history": req.history,
        "image_description": _image_description(req),
        "context": "",
        "sources": [],
        "outfit_items": [],
        "answer": "",
    }

    async def generate():
        async for event in pipeline.astream(state):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    result = await pipeline.ainvoke({
        "question": req.message,
        "history": req.history,
        "image_description": _image_description(req),
        "context": "",
        "sources": [],
        "outfit_items": [],
        "answer": "",
    })
    return ChatResponse(
        answer=result["answer"],
        sources=result["sources"],
        outfit_items=[OutfitItem(**i) for i in result.get("outfit_items", [])],
    )
