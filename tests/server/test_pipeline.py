import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from agents.family_docs import search_family_docs
from server.pipeline import Pipeline, _build_messages, _extract_item_ids, _extract_sources


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


def test_extract_sources_ignores_items_tags():
    msgs = [
        ToolMessage(content="[ITEMS:1,2,3]\nsome outfit content", tool_call_id="1"),
    ]
    # ITEMS tags should not appear in sources
    assert _extract_sources(msgs) == []


# --- _extract_item_ids ---

def test_extract_item_ids_parses_single_tag():
    msgs = [AIMessage(content="Great outfit! [ITEMS:1,5,9]")]
    assert _extract_item_ids(msgs) == [1, 5, 9]


def test_extract_item_ids_parses_tag_from_tool_message():
    msgs = [ToolMessage(content="Navy blazer + jeans. [ITEMS:3,7]", tool_call_id="1")]
    assert _extract_item_ids(msgs) == [3, 7]


def test_extract_item_ids_deduplicates_across_messages():
    msgs = [
        ToolMessage(content="[ITEMS:1,2]", tool_call_id="1"),
        AIMessage(content="[ITEMS:2,3]"),
    ]
    ids = _extract_item_ids(msgs)
    assert ids.count(2) == 1
    assert 1 in ids
    assert 3 in ids


def test_extract_item_ids_returns_empty_when_no_tags():
    msgs = [HumanMessage(content="hi"), AIMessage(content="hello")]
    assert _extract_item_ids(msgs) == []


def test_extract_item_ids_handles_single_id():
    msgs = [AIMessage(content="Wear this. [ITEMS:42]")]
    assert _extract_item_ids(msgs) == [42]


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


@patch("server.pipeline._build_outfit_items", return_value=[])
def test_ainvoke_extracts_answer_from_last_message(_mock_build):
    p = _make_pipeline_with_mock_agent([
        HumanMessage(content="question"),
        AIMessage(content="The answer is 42."),
    ])
    result = asyncio.run(p.ainvoke({
        "question": "q?", "history": [], "context": "", "sources": [], "answer": "",
        "outfit_items": [],
    }))
    assert result["answer"] == "The answer is 42."


@patch("server.pipeline._build_outfit_items", return_value=[])
def test_ainvoke_extracts_sources_from_tool_messages(_mock_build):
    p = _make_pipeline_with_mock_agent([
        HumanMessage(content="question"),
        ToolMessage(content="[family.md]\ncontent", tool_call_id="1"),
        AIMessage(content="answer"),
    ])
    result = asyncio.run(p.ainvoke({
        "question": "q?", "history": [], "context": "", "sources": [], "answer": "",
        "outfit_items": [],
    }))
    assert result["sources"] == ["family.md"]


@patch("server.pipeline._build_outfit_items", return_value=[
    {"item_id": 1, "label": "Navy blazer", "image_url": "/api/wardrobe/image/1"}
])
def test_ainvoke_returns_outfit_items_when_items_tag_present(_mock_build):
    p = _make_pipeline_with_mock_agent([
        AIMessage(content="Wear the navy blazer. [ITEMS:1]"),
    ])
    result = asyncio.run(p.ainvoke({
        "question": "q?", "history": [], "context": "", "sources": [], "answer": "",
        "outfit_items": [],
    }))
    assert len(result["outfit_items"]) == 1
    assert result["outfit_items"][0]["item_id"] == 1


@patch("server.pipeline._build_outfit_items", return_value=[])
def test_ainvoke_passes_history_as_messages(_mock_build):
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
        "outfit_items": [],
    }))

    invoked_messages = mock_agent.ainvoke.call_args[0][0]["messages"]
    assert len(invoked_messages) == 3
    assert isinstance(invoked_messages[0], HumanMessage)
    assert isinstance(invoked_messages[1], AIMessage)
    assert isinstance(invoked_messages[2], HumanMessage)
    assert invoked_messages[2].content == "follow up?"


@patch("server.pipeline._build_outfit_items", return_value=[])
def test_ainvoke_prepends_image_description_when_provided(_mock_build):
    mock_agent = MagicMock()
    mock_agent.ainvoke = AsyncMock(return_value={"messages": [AIMessage(content="ok")]})
    p = Pipeline()
    p._agent = mock_agent

    asyncio.run(p.ainvoke({
        "question": "Does this match anything?",
        "image_description": "A red polo shirt.",
        "history": [],
        "context": "",
        "sources": [],
        "answer": "",
        "outfit_items": [],
    }))

    msgs = mock_agent.ainvoke.call_args[0][0]["messages"]
    last_human = msgs[-1]
    assert "red polo shirt" in last_human.content
    assert "Does this match anything?" in last_human.content


@patch("server.pipeline._build_outfit_items", return_value=[])
def test_ainvoke_preserves_existing_state_keys(_mock_build):
    p = _make_pipeline_with_mock_agent([AIMessage(content="answer")])
    state = {
        "question": "q?", "history": [], "context": "old", "sources": ["x.md"],
        "answer": "", "outfit_items": [],
    }
    result = asyncio.run(p.ainvoke(state))
    assert result["context"] == "old"


# --- _build_messages ---

def test_build_messages_converts_history_and_question():
    msgs = _build_messages({
        "question": "What's next?",
        "history": [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"},
        ],
    })
    assert len(msgs) == 3
    assert isinstance(msgs[0], HumanMessage)
    assert isinstance(msgs[1], AIMessage)
    assert msgs[2].content == "What's next?"


def test_build_messages_prepends_image_description():
    msgs = _build_messages({
        "question": "Does this match?",
        "image_description": "A red polo shirt.",
        "history": [],
    })
    assert "red polo shirt" in msgs[-1].content
    assert "Does this match?" in msgs[-1].content


# --- Pipeline.astream ---

@patch("server.pipeline.create_agent")
@patch("server.pipeline._build_outfit_items", return_value=[])
def test_astream_yields_result_event(mock_build, mock_create_agent):
    mock_agent = MagicMock()
    mock_agent.ainvoke = AsyncMock(return_value={
        "messages": [AIMessage(content="Wear the blue shirt.")]
    })
    mock_create_agent.return_value = mock_agent

    async def run():
        p = Pipeline()
        events = []
        async for event in p.astream({
            "question": "q?", "history": [], "context": "",
            "sources": [], "answer": "", "outfit_items": [],
        }):
            events.append(event)
        return events

    events = asyncio.run(run())
    result_events = [e for e in events if e["type"] == "result"]
    assert len(result_events) == 1
    assert result_events[0]["answer"] == "Wear the blue shirt."


@patch("server.pipeline.create_agent")
@patch("server.pipeline._build_outfit_items", return_value=[
    {"item_id": 3, "label": "Blue blazer", "image_url": "/api/wardrobe/image/3", "person_label": "garrett"}
])
def test_astream_relays_wardrobe_tool_message_verbatim(mock_build, mock_create_agent):
    """When a ToolMessage contains [ITEMS:...], astream uses it as the answer."""
    mock_agent = MagicMock()
    mock_agent.ainvoke = AsyncMock(return_value={
        "messages": [
            ToolMessage(content="Wear the blue blazer. [ITEMS:3]", tool_call_id="1"),
            AIMessage(content="I recommend wearing the blue blazer."),  # supervisor rewrite
        ]
    })
    mock_create_agent.return_value = mock_agent

    async def run():
        p = Pipeline()
        events = []
        async for event in p.astream({
            "question": "q?", "history": [], "context": "",
            "sources": [], "answer": "", "outfit_items": [],
        }):
            events.append(event)
        return events

    events = asyncio.run(run())
    result = next(e for e in events if e["type"] == "result")
    # Verbatim wardrobe response, not supervisor's rewrite
    assert result["answer"] == "Wear the blue blazer. [ITEMS:3]"
    assert len(result["outfit_items"]) == 1
