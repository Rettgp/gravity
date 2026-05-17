import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from agents.family_docs import search_family_docs
from server.pipeline import Pipeline, _extract_sources


# --- _extract_sources ---

def test_extract_sources_finds_bracketed_source_headers():
    msgs = [
        ToolMessage(content="[recipes.md]\nsome content", tool_call_id="1"),
    ]
    assert _extract_sources(msgs) == ["recipes.md"]


def test_extract_sources_collects_multiple_sources():
    msgs = [
        ToolMessage(content="[recipes.md]\ncontent\n\n---\n\n[family.md]\nmore", tool_call_id="1"),
    ]
    assert "recipes.md" in _extract_sources(msgs)
    assert "family.md" in _extract_sources(msgs)


def test_extract_sources_deduplicates_across_tool_messages():
    msgs = [
        ToolMessage(content="[recipes.md]\ncontent", tool_call_id="1"),
        ToolMessage(content="[recipes.md]\nmore content", tool_call_id="2"),
    ]
    assert _extract_sources(msgs) == ["recipes.md"]


def test_extract_sources_ignores_non_tool_messages():
    msgs = [
        HumanMessage(content="[not-a-source.md]"),
        AIMessage(content="[also-not-a-source.md]"),
    ]
    assert _extract_sources(msgs) == []


def test_extract_sources_returns_empty_when_no_tool_messages():
    assert _extract_sources([HumanMessage(content="hi"), AIMessage(content="hello")]) == []


# --- search_family_docs tool ---

@patch("agents.family_docs.raw_search", return_value="[docs.md]\nsome content")
def test_search_family_docs_tool_delegates_to_raw_search(mock_raw_search):
    result = search_family_docs.invoke({"query": "family history"})
    mock_raw_search.assert_called_once_with("family history")
    assert result == "[docs.md]\nsome content"


# --- Pipeline.ainvoke ---

def _make_pipeline_with_mock_agent(return_messages: list) -> Pipeline:
    mock_agent = MagicMock()
    mock_agent.ainvoke = AsyncMock(return_value={"messages": return_messages})
    p = Pipeline()
    p._agent = mock_agent
    return p


def test_ainvoke_extracts_answer_from_last_message():
    p = _make_pipeline_with_mock_agent([
        HumanMessage(content="question"),
        AIMessage(content="The answer is 42."),
    ])
    result = asyncio.run(p.ainvoke({"question": "q?", "history": [], "context": "", "sources": [], "answer": ""}))
    assert result["answer"] == "The answer is 42."


def test_ainvoke_extracts_sources_from_tool_messages():
    p = _make_pipeline_with_mock_agent([
        HumanMessage(content="question"),
        ToolMessage(content="[family.md]\ncontent", tool_call_id="1"),
        AIMessage(content="answer"),
    ])
    result = asyncio.run(p.ainvoke({"question": "q?", "history": [], "context": "", "sources": [], "answer": ""}))
    assert result["sources"] == ["family.md"]


def test_ainvoke_passes_history_as_messages():
    mock_agent = MagicMock()
    mock_agent.ainvoke = AsyncMock(return_value={
        "messages": [AIMessage(content="ok")]
    })
    p = Pipeline()
    p._agent = mock_agent

    asyncio.run(p.ainvoke({
        "question": "follow up?",
        "history": [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
        ],
        "context": "",
        "sources": [],
        "answer": "",
    }))

    invoked_messages = mock_agent.ainvoke.call_args[0][0]["messages"]
    # 2 history turns + current question
    assert len(invoked_messages) == 3
    assert isinstance(invoked_messages[0], HumanMessage)
    assert isinstance(invoked_messages[1], AIMessage)
    assert isinstance(invoked_messages[2], HumanMessage)
    assert invoked_messages[2].content == "follow up?"


def test_ainvoke_preserves_existing_state_keys():
    p = _make_pipeline_with_mock_agent([AIMessage(content="answer")])
    state = {"question": "q?", "history": [], "context": "old", "sources": ["x.md"], "answer": ""}
    result = asyncio.run(p.ainvoke(state))
    assert result["context"] == "old"
