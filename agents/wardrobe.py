import json
import os
import re
from pathlib import Path

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_ollama import ChatOllama
from mcp.server.fastmcp import FastMCP

from source_obsidian.embedder import get_embedder
from source_wardrobe import store

_embedder = None


def _get_embedder():
    global _embedder
    if _embedder is None:
        _embedder = get_embedder()
    return _embedder


def _get_llm() -> ChatOllama:
    # Vision model handles text reasoning too and supports future image-in-chat.
    # It does NOT support Ollama's native tools API, so we use a manual ReAct loop.
    model = os.environ.get("OLLAMA_VISION_MODEL", os.environ["OLLAMA_MODEL"])
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


_TOOLS = {
    "get_person_profile": get_person_profile,
    "search_wardrobe_items": search_wardrobe_items,
    "get_wardrobe_catalog": get_wardrobe_catalog,
}


def _parse_action(text: str) -> tuple[str, dict] | None:
    """Extract the last Action / Action Input block from model output.

    Returns (tool_name, args_dict) or None if no action is found.
    """
    pattern = re.compile(
        r"Action:\s*(\w+)\s*\n"
        r"Action Input:\s*(.*?)(?=\nObservation:|\nThought:|\nAction:|\Z)",
        re.DOTALL,
    )
    matches = list(pattern.finditer(text))
    if not matches:
        return None
    m = matches[-1]
    tool_name = m.group(1).strip()
    raw = m.group(2).strip()
    try:
        args = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        args = {}
    return tool_name, args


def _collect_observed_ids(messages: list) -> set[int]:
    """Return every item ID that actually appeared in a tool Observation message.

    Only IDs present here were genuinely returned by the database — any others
    in the Final Answer are hallucinated and must be rejected.
    """
    ids: set[int] = set()
    for msg in messages:
        content = getattr(msg, "content", "") or ""
        if content.startswith("Observation:"):
            for m in re.finditer(r"\bid:(\d+)\b", content):
                ids.add(int(m.group(1)))
    return ids


def _filter_items_tag(text: str, valid_ids: set[int]) -> str:
    """Remove any item IDs from [ITEMS:...] that were not returned by a tool.

    If no valid IDs remain the tag is removed entirely so no OutfitCard is shown.
    """
    def _replace(m: re.Match) -> str:
        kept = [i for i in m.group(1).split(",") if i.strip().isdigit() and int(i.strip()) in valid_ids]
        return f"[ITEMS:{','.join(kept)}]" if kept else ""

    return re.sub(r"\[ITEMS:([\d,\s]+)\]", _replace, text)


_ITEM_TOOLS = {"get_wardrobe_catalog", "search_wardrobe_items"}


def run_agent(query: str) -> str:
    """Run the wardrobe ReAct sub-agent using a manual text-based loop.

    llama3.2-vision does not support Ollama's native tools API, so we drive the
    ReAct loop ourselves: parse Action/Action Input from the model's text,
    call the tool, append an Observation message, and repeat until Final Answer.

    Guards enforced before accepting a Final Answer:
    1. At least one item-search tool (get_wardrobe_catalog / search_wardrobe_items)
       must have been called — calling only get_person_profile is not enough.
    2. If real item IDs were returned by a tool but the Final Answer contains no
       valid [ITEMS:...] tag, the model is told the exact IDs it observed and asked
       to revise so the UI OutfitCard can be rendered.
    """
    llm = _get_llm()
    messages: list = [
        SystemMessage(content=_load_prompt()),
        HumanMessage(content=query),
    ]
    item_lookup_done = False  # True once get_wardrobe_catalog or search_wardrobe_items runs

    for _ in range(10):
        response = llm.invoke(messages)
        content = response.content
        messages.append(AIMessage(content=content))

        if "Final Answer:" in content:
            if not item_lookup_done:
                # Model answered without checking the wardrobe database
                messages.append(HumanMessage(content=(
                    "You must call get_wardrobe_catalog or search_wardrobe_items "
                    "to retrieve actual items from the database before giving a "
                    "Final Answer. Calling only get_person_profile is not sufficient. "
                    "Please look up the wardrobe items now."
                )))
                continue

            match = re.search(r"Final Answer:\s*(.*)", content, re.DOTALL)
            answer = match.group(1).strip() if match else content

            # Strip any IDs the model invented — only trust what the tools returned
            observed = _collect_observed_ids(messages)
            filtered = _filter_items_tag(answer, observed)

            # If real items were found but the tag is missing / was fully stripped,
            # the model hallucinated its recommendation — force it to redo with real IDs
            if observed and "[ITEMS:" not in filtered:
                id_list = ",".join(str(i) for i in sorted(observed))
                messages.append(HumanMessage(content=(
                    f"Your Final Answer did not include a valid [ITEMS:...] tag, or "
                    f"it referenced item IDs that were not in the tool Observations. "
                    f"The only valid IDs from the database are: {id_list}. "
                    f"Please revise your Final Answer to recommend from those items "
                    f"only and end with [ITEMS:{id_list}] (or a subset)."
                )))
                continue

            return filtered

        call = _parse_action(content)
        if call:
            name, args = call
            if name in _ITEM_TOOLS:
                item_lookup_done = True
            fn = _TOOLS.get(name)
            if fn:
                try:
                    observation = fn.invoke(args)
                except Exception as exc:
                    observation = f"Tool error: {exc}"
            else:
                observation = f"Unknown tool: {name}"
            messages.append(HumanMessage(content=f"Observation: {observation}"))
        else:
            # No action and no Final Answer — return whatever the model produced
            # (no [ITEMS:...] filtering needed since no tools were called)
            return content

    return messages[-1].content if messages else "Unable to generate a recommendation."


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    def wardrobe_assistant(query: str) -> str:
        """Answer wardrobe and outfit questions using the person's clothing catalog.
        Always include the person's name in the query."""
        return run_agent(query)
