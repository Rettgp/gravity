import asyncio
import logging
import os
import re
from collections.abc import AsyncIterator
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

logger = logging.getLogger("gravity.pipeline")


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


def extract_item_ids(messages: list) -> list[int]:
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


def build_outfit_items(item_ids: list[int]) -> list[dict]:
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
def wardrobe_assistant(person_label: str, query: str) -> str:
    """Answer wardrobe and outfit questions using the person's clothing catalog.

    Args:
        person_label: The person whose wardrobe to check (e.g. 'garrett').
            Extract this from the user's message.
        query: The outfit or wardrobe question.
    """
    return _run_wardrobe_agent(query, person_label=person_label)


def _build_messages(state: dict) -> list:
    """Convert history + current question into a LangChain message list."""
    messages = []
    for turn in state.get("history", []):
        if turn["role"] == "user":
            messages.append(HumanMessage(content=turn["content"]))
        else:
            messages.append(AIMessage(content=turn["content"]))
    question = state["question"]
    if state.get("image_description"):
        question = f"[User attached an image: {state['image_description']}]\n{question}"
    messages.append(HumanMessage(content=question))
    return messages


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
        messages = _build_messages(state)
        result = await self._get_agent().ainvoke({"messages": messages})
        answer = result["messages"][-1].content
        # If the wardrobe agent returned a response with item IDs, relay it verbatim
        # rather than using the supervisor's potentially hallucinated rewrite.
        for msg in result["messages"]:
            if isinstance(msg, ToolMessage) and "[ITEMS:" in (msg.content or ""):
                answer = msg.content
                break
        sources = _extract_sources(result["messages"])
        item_ids = extract_item_ids(result["messages"])
        outfit_items = build_outfit_items(item_ids)
        return {**state, "answer": answer, "sources": sources, "outfit_items": outfit_items}

    async def astream(self, state: dict) -> AsyncIterator[dict]:
        """Stream reasoning steps and the final result as SSE-ready dicts.

        Wardrobe sub-agent steps (Thought / Action / Observation) are captured
        via a thread-safe callback and yielded in real-time while the agent runs.
        The final event is always ``{"type": "result", ...}`` or ``{"type": "error", ...}``.
        """
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[dict] = asyncio.Queue()

        def on_wardrobe_step(event: dict) -> None:
            # Called from the sync tool thread — schedule on the event loop
            loop.call_soon_threadsafe(queue.put_nowait, event)

        async def _run() -> None:
            try:
                messages = _build_messages(state)

                @_tool
                async def wardrobe_assistant_streaming(person_label: str, query: str) -> str:
                    """Answer wardrobe and outfit questions using the person's clothing catalog.

                    Args:
                        person_label: The person whose wardrobe to check (e.g. 'garrett').
                            Extract this from the user's message.
                        query: The outfit or wardrobe question.
                    """
                    logger.info(
                        "supervisor_tool_call | tool=wardrobe_assistant | person=%s | query=%.200s",
                        person_label, query,
                    )
                    # run_agent is blocking (calls llm.invoke in a loop) — run it in a
                    # thread so the event loop stays free to deliver step events in real-time
                    result = await asyncio.to_thread(
                        _run_wardrobe_agent, query,
                        person_label=person_label,
                        on_step=on_wardrobe_step,
                    )
                    logger.info(
                        "supervisor_tool_result | tool=wardrobe_assistant | chars=%d | preview=%.300s",
                        len(result), result[:300].replace("\n", " "),
                    )
                    return result

                agent = create_agent(
                    _get_llm(),
                    [search_family_docs, wardrobe_assistant_streaming],
                    system_prompt=_load_prompt(),
                )
                result = await agent.ainvoke({"messages": messages})

                answer = result["messages"][-1].content
                for msg in result["messages"]:
                    if isinstance(msg, ToolMessage) and "[ITEMS:" in (msg.content or ""):
                        answer = msg.content
                        break

                sources = _extract_sources(result["messages"])
                item_ids = extract_item_ids(result["messages"])
                outfit_items = build_outfit_items(item_ids)

                logger.info(
                    "pipeline_result | outfit_items=%d | sources=%d | answer_preview=%.200s",
                    len(outfit_items), len(sources),
                    answer[:200].replace("\n", " "),
                )
                loop.call_soon_threadsafe(queue.put_nowait, {
                    "type": "result",
                    "answer": answer,
                    "sources": sources,
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
            yield event
            if event["type"] in ("result", "error"):
                break

        await task  # surface any unexpected exceptions


pipeline = Pipeline()
