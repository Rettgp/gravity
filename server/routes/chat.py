from fastapi import APIRouter
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


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    image_description: str | None = None
    if req.image_base64:
        try:
            image_description = describe_image(req.image_base64)
        except Exception:
            image_description = None

    result = await pipeline.ainvoke({
        "question": req.message,
        "history": req.history,
        "image_description": image_description,
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
