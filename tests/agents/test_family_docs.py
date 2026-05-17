from unittest.mock import MagicMock, patch

from langchain_core.documents import Document

from agents import family_docs


# --- raw_search ---

@patch("agents.family_docs.similarity_search")
@patch("agents.family_docs._get_embedder")
def test_raw_search_returns_formatted_results(mock_get_embedder, mock_search):
    mock_search.return_value = [
        Document(page_content="Alice was born in 2010", metadata={"source": "family.md"}),
    ]
    result = family_docs.raw_search("Alice birthday")
    assert "Alice was born in 2010" in result
    assert "family.md" in result


@patch("agents.family_docs.similarity_search")
@patch("agents.family_docs._get_embedder")
def test_raw_search_separates_multiple_results_with_divider(mock_get_embedder, mock_search):
    mock_search.return_value = [
        Document(page_content="first doc", metadata={"source": "a.md"}),
        Document(page_content="second doc", metadata={"source": "b.md"}),
    ]
    result = family_docs.raw_search("docs")
    assert "---" in result
    assert "first doc" in result
    assert "second doc" in result


@patch("agents.family_docs.similarity_search")
@patch("agents.family_docs._get_embedder")
def test_raw_search_empty_results_returns_not_found_message(mock_get_embedder, mock_search):
    mock_search.return_value = []
    result = family_docs.raw_search("unknown topic")
    assert result == "No relevant documents found."


@patch("agents.family_docs.similarity_search")
@patch("agents.family_docs._get_embedder")
def test_raw_search_missing_source_metadata_falls_back_to_unknown(mock_get_embedder, mock_search):
    mock_search.return_value = [
        Document(page_content="content", metadata={}),
    ]
    result = family_docs.raw_search("anything")
    assert "unknown" in result


# --- MCP tool registration ---

class _CapturingMCP:
    def __init__(self):
        self.tools: dict = {}

    def tool(self):
        def decorator(fn):
            self.tools[fn.__name__] = fn
            return fn
        return decorator


@patch("agents.family_docs.run_agent", return_value="synthesized answer")
def test_mcp_tool_delegates_to_run_agent(mock_run_agent):
    mcp = _CapturingMCP()
    family_docs.register(mcp)
    result = mcp.tools["search_family_docs"](query="What is Dad's birthday?")
    mock_run_agent.assert_called_once_with("What is Dad's birthday?")
    assert result == "synthesized answer"
