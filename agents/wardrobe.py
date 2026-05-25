import logging
import os
import re
from collections.abc import Callable
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_ollama import ChatOllama
from mcp.server.fastmcp import FastMCP

from source_obsidian.embedder import get_embedder
from source_wardrobe import store

logger = logging.getLogger("gravity.wardrobe")

_embedder = None


def _get_embedder():
    global _embedder
    if _embedder is None:
        _embedder = get_embedder()
    return _embedder


def _get_llm() -> ChatOllama:
    model = os.environ.get(
        "OLLAMA_WARDROBE_MODEL",
        os.environ.get("OLLAMA_MODEL", "qwen2.5:14b"),
    )
    return ChatOllama(
        model=model,
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
    )


def _load_prompt() -> str:
    path = Path(os.environ.get("WARDROBE_PROMPT_FILE", "prompts/wardrobe.md"))
    return path.read_text(encoding="utf-8")


def _format_items(items: list[dict]) -> str:
    if not items:
        return "No items found."
    lines = []
    for item in items:
        seasons = ", ".join(item["seasons"]) if item["seasons"] else "all seasons"
        occasions = ", ".join(item["occasions"]) if item["occasions"] else "general"
        colors = ", ".join(item["colors"]) if item["colors"] else "unknown"
        lines.append(
            f"- id:{item['id']} | {item['category'] or 'misc'} | {item['description']} "
            f"[colors: {colors}, seasons: {seasons}, occasions: {occasions}]"
        )
    return "\n".join(lines)


def _filter_items_tag(text: str, valid_ids: set[int]) -> str:
    """Remove any item IDs from [ITEMS:...] that are not in valid_ids.

    If no valid IDs remain the tag is removed entirely so no OutfitCard is shown.
    """
    def _replace(m: re.Match) -> str:
        kept = [i for i in m.group(1).split(",") if i.strip().isdigit() and int(i.strip()) in valid_ids]
        return f"[ITEMS:{','.join(kept)}]" if kept else ""

    return re.sub(r"\[ITEMS:([\d,\s]+)\]", _replace, text)


def _find_person_label(query: str) -> str | None:
    """Return the first known person label (or display name) found in the query."""
    query_lower = query.lower()
    for p in store.get_all_persons():
        if p["label"] in query_lower or p["display_name"].lower() in query_lower:
            return p["label"]
    return None


@tool
def get_person_profile(person_label: str) -> str:
    """Get a person's profile including their physical description for fit recommendations."""
    person = store.get_person(person_label.lower().strip())
    if not person:
        return f"No profile found for '{person_label}'. They may not have been ingested yet."
    parts = [f"Name: {person['display_name']} (label: {person['label']})"]
    if person["pose_description"]:
        parts.append(f"Appearance: {person['pose_description']}")
    else:
        parts.append("Appearance: No pose photo ingested yet.")
    return "\n".join(parts)


@tool
def search_wardrobe_items(
    person_label: str, query: str, seasons: str = "", occasions: str = ""
) -> str:
    """Semantic search over a person's wardrobe items.

    Args:
        person_label: The person's label (e.g. 'garrett').
        query: Natural language description of what to find (e.g. 'formal dress shirt').
        seasons: Comma-separated seasons to filter by (spring/summer/fall/winter). Optional.
        occasions: Comma-separated occasions to filter by (casual/business/formal/athletic/relax). Optional.
    """
    label = person_label.lower().strip()
    season_list = [s.strip() for s in seasons.split(",") if s.strip()] if seasons else None
    occasion_list = [o.strip() for o in occasions.split(",") if o.strip()] if occasions else None
    embedding = _get_embedder().embed_query(query)
    items = store.search_items(label, embedding, seasons=season_list, occasions=occasion_list)
    return _format_items(items)


@tool
def get_wardrobe_catalog(
    person_label: str, category: str = "", season: str = "", occasion: str = ""
) -> str:
    """Get a filtered list of all wardrobe items for a person.

    Args:
        person_label: The person's label (e.g. 'garrett').
        category: Filter by category (tops/bottoms/shoes/outerwear/accessories/dress/suit). Optional.
        season: Filter by a single season (spring/summer/fall/winter). Optional.
        occasion: Filter by a single occasion (casual/business/formal/athletic/relax). Optional.
    """
    label = person_label.lower().strip()
    items = store.get_catalog(
        label,
        category=category or None,
        season=season or None,
        occasion=occasion or None,
    )
    return _format_items(items)


def run_agent(
    query: str,
    person_label: str | None = None,
    on_step: Callable[[dict], None] | None = None,
) -> str:
    """Answer a wardrobe question by pre-loading the person's catalog and making
    a single LLM call with all the data as context.

    The llama3.2-vision model does not reliably follow a ReAct tool-calling loop,
    so we fetch the profile and full catalog programmatically, inject them as
    context, and ask the model to select and tag items in one shot.

    Args:
        query: The natural-language outfit question.
        person_label: Explicit person label (e.g. 'garrett').  When provided,
            free-text name extraction is skipped entirely.  Callers that know
            the person should always supply this.
        on_step: Optional callback for streaming reasoning steps.
    """
    if not person_label:
        person_label = _find_person_label(query)
    if not person_label:
        return (
            "Please include a person's name in your question "
            "(e.g., 'What should Garrett wear?')."
        )

    logger.info("agent_start | person=%s | query=%.150s", person_label, query)

    # --- Load profile ---
    person = store.get_person(person_label)
    profile_parts = []
    if person:
        profile_parts.append(f"Name: {person['display_name']}")
        if person["pose_description"]:
            profile_parts.append(f"Appearance: {person['pose_description']}")
    profile_text = "\n".join(profile_parts) if profile_parts else "No profile available."

    if on_step:
        on_step({"type": "step", "step_type": "action",
                 "tool": "get_person_profile", "args": {"person_label": person_label}})
        on_step({"type": "step", "step_type": "observation", "content": profile_text})

    # --- Load full catalog ---
    catalog_items = store.get_catalog(person_label)
    catalog_text = _format_items(catalog_items)

    logger.info("catalog_loaded | person=%s | items=%d", person_label, len(catalog_items))

    if on_step:
        on_step({"type": "step", "step_type": "action",
                 "tool": "get_wardrobe_catalog", "args": {"person_label": person_label}})
        display = catalog_text if len(catalog_text) <= 400 else catalog_text[:400] + "\n…"
        on_step({"type": "step", "step_type": "observation", "content": display})

    if not catalog_items:
        logger.warning("no_catalog_items | person=%s", person_label)
        return "No wardrobe items found for your request. Please try again with a more specific question."

    valid_ids = {item["id"] for item in catalog_items}

    # --- Single LLM call with catalog as context ---
    context = (
        f"Person profile:\n{profile_text}\n\n"
        f"Wardrobe catalog:\n{catalog_text}"
    )

    llm = _get_llm()
    messages = [
        SystemMessage(content=_load_prompt()),
        HumanMessage(content=context),
        HumanMessage(content=query),
    ]

    response = llm.invoke(messages)
    answer = response.content.strip()

    # Strip "Final Answer:" prefix if the model includes it
    fa_match = re.search(r"Final Answer:\s*(.*)", answer, re.DOTALL)
    if fa_match:
        answer = fa_match.group(1).strip()

    # Remove hallucinated IDs (any [ITEMS:...] IDs not in the catalog)
    filtered = _filter_items_tag(answer, valid_ids)

    logger.info(
        "final_answer | person=%s | answer_preview=%.200s",
        person_label,
        filtered[:200].replace("\n", " "),
    )
    return filtered


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    def wardrobe_assistant(query: str) -> str:
        """Answer wardrobe and outfit questions using the person's clothing catalog.
        Always include the person's name in the query."""
        return run_agent(query)
