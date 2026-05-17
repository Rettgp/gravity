import os
from pathlib import Path

from langchain.agents import create_agent
from langchain_core.tools import tool
from langchain_ollama import ChatOllama
from mcp.server.fastmcp import FastMCP

from source_obsidian.embedder import get_embedder
from source_obsidian.store import similarity_search

_embedder = None


def _get_embedder():
    global _embedder
    if _embedder is None:
        _embedder = get_embedder()
    return _embedder


def _get_llm() -> ChatOllama:
    return ChatOllama(
        model=os.environ["OLLAMA_MODEL"],
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
    )


def _load_prompt() -> str:
    path = Path(os.environ.get("FAMILY_DOCS_PROMPT_FILE", "prompts/family_docs.md"))
    return path.read_text(encoding="utf-8")


def raw_search(query: str) -> str:
    """Search the vault and return formatted chunks with source headers."""
    docs = similarity_search(query, _get_embedder(), k=5)
    if not docs:
        return "No relevant documents found."
    results = []
    for doc in docs:
        source = doc.metadata.get("source", "unknown")
        results.append(f"[{source}]\n{doc.page_content}")
    return "\n\n---\n\n".join(results)


@tool
def search_family_docs(query: str) -> str:
    """Search the family Obsidian vault for notes, records, recipes, plans, and personal documents."""
    return raw_search(query)


def run_agent(query: str) -> str:
    """Run the family_docs ReAct sub-agent to produce a synthesized answer."""
    agent = create_agent(_get_llm(), [search_family_docs], system_prompt=_load_prompt())
    result = agent.invoke({"messages": [("human", query)]})
    return result["messages"][-1].content


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    def search_family_docs(query: str) -> str:
        """Search the family Obsidian vault for relevant documents."""
        return run_agent(query)
