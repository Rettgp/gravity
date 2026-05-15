from unittest.mock import MagicMock, patch
from langchain_core.documents import Document
from agents import family_docs


class _CapturingMCP:
    """Minimal stand-in for FastMCP that captures the registered tool function."""

    def __init__(self):
        self.tools: dict = {}

    def tool(self):
        def decorator(fn):
            self.tools[fn.__name__] = fn
            return fn
        return decorator


def _register_and_get_tool(mock_search_docs=None):
    mcp = _CapturingMCP()
    if mock_search_docs is not None:
        family_docs._embedder = None  # reset cached embedder
    family_docs.register(mcp)
    return mcp.tools["search_family_docs"]


@patch("agents.family_docs.similarity_search")
@patch("agents.family_docs._get_embedder")
def test_returns_formatted_results(mock_get_embedder, mock_search):
    mock_search.return_value = [
        Document(page_content="Alice was born in 2010", metadata={"source": "family.md"}),
    ]
    tool = _register_and_get_tool()
    result = tool(query="Alice birthday")
    assert "Alice was born in 2010" in result
    assert "family.md" in result


@patch("agents.family_docs.similarity_search")
@patch("agents.family_docs._get_embedder")
def test_separates_multiple_results_with_divider(mock_get_embedder, mock_search):
    mock_search.return_value = [
        Document(page_content="first doc", metadata={"source": "a.md"}),
        Document(page_content="second doc", metadata={"source": "b.md"}),
    ]
    tool = _register_and_get_tool()
    result = tool(query="docs")
    assert "---" in result
    assert "first doc" in result
    assert "second doc" in result


@patch("agents.family_docs.similarity_search")
@patch("agents.family_docs._get_embedder")
def test_empty_results_returns_not_found_message(mock_get_embedder, mock_search):
    mock_search.return_value = []
    tool = _register_and_get_tool()
    result = tool(query="unknown topic")
    assert result == "No relevant documents found."


@patch("agents.family_docs.similarity_search")
@patch("agents.family_docs._get_embedder")
def test_missing_source_metadata_falls_back_to_unknown(mock_get_embedder, mock_search):
    mock_search.return_value = [
        Document(page_content="content", metadata={}),
    ]
    tool = _register_and_get_tool()
    result = tool(query="anything")
    assert "unknown" in result
