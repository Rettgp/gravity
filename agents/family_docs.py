from mcp.server.fastmcp import FastMCP

from source_obsidian.embedder import get_embedder
from source_obsidian.store import similarity_search

_embedder = None


def _get_embedder():
    global _embedder
    if _embedder is None:
        _embedder = get_embedder()
    return _embedder


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    def search_family_docs(query: str) -> str:
        """Search the family Obsidian vault for relevant documents."""
        docs = similarity_search(query, _get_embedder(), k=5)
        if not docs:
            return "No relevant documents found."
        results = []
        for doc in docs:
            source = doc.metadata.get("source", "unknown")
            results.append(f"[{source}]\n{doc.page_content}")
        return "\n\n---\n\n".join(results)
