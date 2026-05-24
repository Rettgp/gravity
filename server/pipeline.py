import os
import re
from pathlib import Path

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_ollama import ChatOllama

from agents.family_docs import search_family_docs
from agents.wardrobe import (
    get_person_profile,
    get_wardrobe_catalog,
    search_wardrobe_items,
    run_agent as _run_wardrobe_agent,
)
from source_wardrobe import store as wardrobe_store


def _get_llm() -> ChatOllama:
    return ChatOllama(
        model=os.environ["OLLAMA_MODEL"],
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
    )


def _load_prompt() -> str:
    path = Path(os.environ.get("PIPELINE_PROMPT_FILE", "prompts/pipeline.md"))
    return path.read_text(encoding="utf-8")


def _extract_sources(messages: list) -> list[str]:
    sources = []
    for msg in messages:
        if isinstance(msg, ToolMessage):
            for line in msg.content.split("\n"):
                stripped = line.strip()
                if stripped.startswith("[") and stripped.endswith("]"):
                    # Skip ITEMS tags — those are wardrobe item references, not doc sources
                    if not stripped.startswith("[ITEMS:"):
                        source = stripped[1:-1]
                        if source not in sources:
                            sources.append(source)
    return sources


def _extract_item_ids(messages: list) -> list[int]:
    """Parse [ITEMS:id1,id2,...] tags from all messages to collect recommended item IDs."""
    ids: list[int] = []
    seen: set[int] = set()
    for msg in messages:
        content = msg.content if hasattr(msg, "content") else ""
        for match in re.finditer(r"\[ITEMS:([\d,]+)\]", content):
            for raw_id in match.group(1).split(","):
                raw_id = raw_id.strip()
                if raw_id.isdigit():
                    item_id = int(raw_id)
                    if item_id not in seen:
                        seen.add(item_id)
                        ids.append(item_id)
    return ids


def _build_outfit_items(item_ids: list[int]) -> list[dict]:
    """Look up wardrobe items and build API-ready dicts with image URLs."""
    if not item_ids:
        return []
    items = wardrobe_store.get_items_by_ids(item_ids)
    return [
        {
            "item_id": item["id"],
            "label": item["description"],
            "image_url": f"/api/wardrobe/image/{item['id']}",
            "person_label": item.get("person_label", ""),
        }
        for item in items
    ]


# Expose wardrobe_assistant as a pipeline-level tool so the supervisor can call it
from langchain_core.tools import tool as _tool


@_tool
def wardrobe_assistant(query: str) -> str:
    """Answer wardrobe and outfit questions using the person's clothing catalog.
    Always include the person's name in the query."""
    return _run_wardrobe_agent(query)


class Pipeline:
    def __init__(self) -> None:
        self._agent = None

    def _get_agent(self):
        if self._agent is None:
            self._agent = create_agent(
                _get_llm(),
                [search_family_docs, wardrobe_assistant],
                system_prompt=_load_prompt(),
            )
        return self._agent

    async def ainvoke(self, state: dict) -> dict:
        messages = []
        for turn in state.get("history", []):
            if turn["role"] == "user":
                messages.append(HumanMessage(content=turn["content"]))
            else:
                messages.append(AIMessage(content=turn["content"]))

        question = state["question"]
        # Prepend vision description if an image was attached
        if state.get("image_description"):
            question = f"[User attached an image: {state['image_description']}]\n{question}"
        messages.append(HumanMessage(content=question))

        result = await self._get_agent().ainvoke({"messages": messages})
        answer = result["messages"][-1].content
        # If the wardrobe agent returned a response with item IDs, relay it verbatim
        # rather than using the supervisor's potentially hallucinated rewrite.
        for msg in result["messages"]:
            if isinstance(msg, ToolMessage) and "[ITEMS:" in (msg.content or ""):
                answer = msg.content
                break
        sources = _extract_sources(result["messages"])
        item_ids = _extract_item_ids(result["messages"])
        outfit_items = _build_outfit_items(item_ids)

        return {**state, "answer": answer, "sources": sources, "outfit_items": outfit_items}


pipeline = Pipeline()
