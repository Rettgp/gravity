from fastapi import APIRouter
from pydantic import BaseModel

from server.pipeline import pipeline

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


class ChatResponse(BaseModel):
    answer: str
    sources: list[str]


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    result = await pipeline.ainvoke({
        "question": req.message,
        "history": req.history,
        "context": "",
        "sources": [],
        "answer": "",
    })
    return ChatResponse(answer=result["answer"], sources=result["sources"])
