from unittest.mock import MagicMock, patch

from langchain_core.messages import HumanMessage

from agents import wardrobe


# --- _format_items ---

def test_format_items_returns_no_items_message_when_empty():
    result = wardrobe._format_items([])
    assert result == "No items found."


def test_format_items_formats_each_item():
    items = [
        {
            "id": 1,
            "category": "tops",
            "description": "White dress shirt",
            "colors": ["white"],
            "seasons": ["spring", "summer"],
            "occasions": ["business"],
        }
    ]
    result = wardrobe._format_items(items)
    assert "id:1" in result
    assert "White dress shirt" in result
    assert "tops" in result
    assert "white" in result


def test_format_items_handles_missing_optional_fields():
    items = [
        {
            "id": 5,
            "category": None,
            "description": "A mystery item",
            "colors": [],
            "seasons": [],
            "occasions": [],
        }
    ]
    result = wardrobe._format_items(items)
    assert "id:5" in result
    assert "mystery item" in result
    assert "misc" in result


# --- get_person_profile tool ---

@patch("agents.wardrobe.store.get_person")
def test_get_person_profile_returns_formatted_info(mock_get_person):
    mock_get_person.return_value = {
        "label": "garrett",
        "display_name": "Garrett",
        "pose_image_path": "/path/pose.jpg",
        "pose_description": "Athletic build, medium skin tone.",
    }
    result = wardrobe.get_person_profile.invoke({"person_label": "garrett"})
    assert "Garrett" in result
    assert "Athletic build" in result


@patch("agents.wardrobe.store.get_person")
def test_get_person_profile_returns_not_found_message(mock_get_person):
    mock_get_person.return_value = None
    result = wardrobe.get_person_profile.invoke({"person_label": "unknown"})
    assert "No profile found" in result


@patch("agents.wardrobe.store.get_person")
def test_get_person_profile_normalizes_label_to_lowercase(mock_get_person):
    mock_get_person.return_value = None
    wardrobe.get_person_profile.invoke({"person_label": "GARRETT"})
    mock_get_person.assert_called_once_with("garrett")


# --- search_wardrobe_items tool ---

@patch("agents.wardrobe.store.search_items")
@patch("agents.wardrobe._get_embedder")
def test_search_wardrobe_items_returns_formatted_results(mock_embedder, mock_search):
    mock_embedder.return_value.embed_query.return_value = [0.1] * 384
    mock_search.return_value = [
        {
            "id": 3,
            "category": "bottoms",
            "description": "Dark slim jeans",
            "colors": ["navy"],
            "seasons": ["fall"],
            "occasions": ["casual"],
        }
    ]
    result = wardrobe.search_wardrobe_items.invoke({
        "person_label": "garrett",
        "query": "casual jeans",
    })
    assert "id:3" in result
    assert "Dark slim jeans" in result


@patch("agents.wardrobe.store.search_items")
@patch("agents.wardrobe._get_embedder")
def test_search_wardrobe_items_parses_seasons_and_occasions(mock_embedder, mock_search):
    mock_embedder.return_value.embed_query.return_value = [0.0] * 384
    mock_search.return_value = []
    wardrobe.search_wardrobe_items.invoke({
        "person_label": "garrett",
        "query": "shirt",
        "seasons": "spring,summer",
        "occasions": "business",
    })
    mock_search.assert_called_once_with(
        "garrett",
        [0.0] * 384,
        seasons=["spring", "summer"],
        occasions=["business"],
    )


@patch("agents.wardrobe.store.search_items")
@patch("agents.wardrobe._get_embedder")
def test_search_wardrobe_items_no_filter_passes_none(mock_embedder, mock_search):
    mock_embedder.return_value.embed_query.return_value = [0.0] * 384
    mock_search.return_value = []
    wardrobe.search_wardrobe_items.invoke({
        "person_label": "garrett",
        "query": "shoes",
    })
    mock_search.assert_called_once_with("garrett", [0.0] * 384, seasons=None, occasions=None)


# --- get_wardrobe_catalog tool ---

@patch("agents.wardrobe.store.get_catalog")
def test_get_wardrobe_catalog_calls_store_with_filters(mock_get_catalog):
    mock_get_catalog.return_value = []
    wardrobe.get_wardrobe_catalog.invoke({
        "person_label": "sarah",
        "category": "tops",
        "season": "summer",
        "occasion": "business",
    })
    mock_get_catalog.assert_called_once_with(
        "sarah", category="tops", season="summer", occasion="business"
    )


@patch("agents.wardrobe.store.get_catalog")
def test_get_wardrobe_catalog_passes_none_for_empty_strings(mock_get_catalog):
    mock_get_catalog.return_value = []
    wardrobe.get_wardrobe_catalog.invoke({
        "person_label": "garrett",
        "category": "",
        "season": "",
        "occasion": "",
    })
    mock_get_catalog.assert_called_once_with(
        "garrett", category=None, season=None, occasion=None
    )


# --- MCP registration ---

class _CapturingMCP:
    def __init__(self):
        self.tools: dict = {}

    def tool(self):
        def decorator(fn):
            self.tools[fn.__name__] = fn
            return fn
        return decorator


@patch("agents.wardrobe.run_agent", return_value="Navy blazer with khaki trousers. [ITEMS:1,5]")
def test_mcp_tool_delegates_to_run_agent(mock_run_agent):
    mcp = _CapturingMCP()
    wardrobe.register(mcp)
    result = mcp.tools["wardrobe_assistant"](query="What should Garrett wear?")
    mock_run_agent.assert_called_once_with("What should Garrett wear?")
    assert "Navy blazer" in result


# --- _collect_observed_ids ---

def test_collect_observed_ids_extracts_ids_from_observations():
    messages = [
        HumanMessage(content="Observation: - id:1 | tops | White shirt\n- id:3 | bottoms | Dark jeans")
    ]
    ids = wardrobe._collect_observed_ids(messages)
    assert ids == {1, 3}


def test_collect_observed_ids_ignores_non_observation_messages():
    messages = [
        HumanMessage(content="id:99 is not in an observation"),
        HumanMessage(content="Observation: - id:5 | tops | Blue polo"),
    ]
    ids = wardrobe._collect_observed_ids(messages)
    assert ids == {5}
    assert 99 not in ids


def test_collect_observed_ids_returns_empty_when_no_tools_called():
    messages = [HumanMessage(content="Some other content")]
    assert wardrobe._collect_observed_ids(messages) == set()


# --- _filter_items_tag ---

def test_filter_items_tag_keeps_valid_ids():
    result = wardrobe._filter_items_tag("Great outfit. [ITEMS:1,3,5]", {1, 3, 5})
    assert result == "Great outfit. [ITEMS:1,3,5]"


def test_filter_items_tag_removes_hallucinated_ids():
    result = wardrobe._filter_items_tag("Nice look. [ITEMS:1,2,99]", {1, 2})
    assert "99" not in result
    assert "[ITEMS:1,2]" in result


def test_filter_items_tag_removes_tag_entirely_when_all_ids_invalid():
    result = wardrobe._filter_items_tag("Here is an outfit. [ITEMS:98,99]", {1, 2, 3})
    assert "[ITEMS:" not in result


def test_filter_items_tag_no_op_when_no_tag():
    text = "Just wear whatever you like."
    assert wardrobe._filter_items_tag(text, {1, 2}) == text


# --- _parse_action ---

def test_parse_action_extracts_tool_name_and_args():
    text = (
        "Thought: I need the profile.\n"
        'Action: get_person_profile\n'
        'Action Input: {"person_label": "garrett"}\n'
    )
    result = wardrobe._parse_action(text)
    assert result is not None
    name, args = result
    assert name == "get_person_profile"
    assert args == {"person_label": "garrett"}


def test_parse_action_returns_none_when_no_action():
    text = "Thought: I already have enough information.\nFinal Answer: Wear the blue shirt."
    assert wardrobe._parse_action(text) is None


def test_parse_action_returns_last_action_when_multiple():
    text = (
        'Action: get_person_profile\nAction Input: {"person_label": "garrett"}\n'
        "Observation: Athletic build.\n"
        'Action: search_wardrobe_items\nAction Input: {"person_label": "garrett", "query": "formal"}\n'
    )
    result = wardrobe._parse_action(text)
    assert result is not None
    name, args = result
    assert name == "search_wardrobe_items"
    assert args["query"] == "formal"


def test_parse_action_handles_invalid_json_gracefully():
    text = "Action: get_person_profile\nAction Input: not-json\n"
    result = wardrobe._parse_action(text)
    # Returns the tool name with empty args rather than crashing
    assert result is not None
    name, args = result
    assert name == "get_person_profile"
    assert args == {}


# --- run_agent ---

def test_run_agent_returns_final_answer_after_item_tool_call():
    """Agent returns the text after 'Final Answer:' once an item-search tool has been called.
    When the catalog returns no items (observed is empty), no [ITEMS:] retry is triggered."""
    tool_mock = MagicMock()
    tool_mock.invoke.return_value = "No items found."  # empty catalog — no id: in observation

    first_response = MagicMock()
    first_response.content = (
        "Thought: I need to look at Garrett's wardrobe.\n"
        'Action: get_wardrobe_catalog\n'
        'Action Input: {"person_label": "garrett"}\n'
    )
    second_response = MagicMock()
    second_response.content = "Final Answer: Your wardrobe has no items for this season."

    with patch("agents.wardrobe._get_llm") as mock_llm, \
         patch.dict("agents.wardrobe._TOOLS", {"get_wardrobe_catalog": tool_mock}):
        mock_llm.return_value.invoke.side_effect = [first_response, second_response]
        result = wardrobe.run_agent("What should Garrett wear?")

    assert result == "Your wardrobe has no items for this season."


def test_run_agent_injects_correction_when_no_item_tool_called():
    """If the model gives a Final Answer without calling a wardrobe-search tool
    (even if get_person_profile was called), a correction is injected."""
    catalog_mock = MagicMock()
    catalog_mock.invoke.return_value = "- id:7 | tops | Blue shirt [colors: blue, seasons: summer]"

    # First call: only calls get_person_profile — blocked because no item lookup done
    first_response = MagicMock()
    first_response.content = "Final Answer: Wear something blue."
    # Second call: model now calls catalog tool after correction
    second_response = MagicMock()
    second_response.content = (
        "Thought: I need to look up wardrobe items.\n"
        'Action: get_wardrobe_catalog\n'
        'Action Input: {"person_label": "garrett"}\n'
    )
    # Third call: final answer after seeing real items
    third_response = MagicMock()
    third_response.content = "Final Answer: Wear the blue shirt. [ITEMS:7]"

    with patch("agents.wardrobe._get_llm") as mock_llm, \
         patch.dict("agents.wardrobe._TOOLS", {"get_wardrobe_catalog": catalog_mock}):
        mock_llm.return_value.invoke.side_effect = [first_response, second_response, third_response]
        result = wardrobe.run_agent("What should Garrett wear?")

    assert mock_llm.return_value.invoke.call_count == 3
    catalog_mock.invoke.assert_called_once()
    assert "[ITEMS:7]" in result


def test_run_agent_forces_retry_when_items_tag_missing_after_lookup():
    """If the model called an item-search tool (observed IDs exist) but its Final Answer
    omits the [ITEMS:...] tag entirely, a correction is injected listing the valid IDs."""
    tool_mock = MagicMock()
    tool_mock.invoke.return_value = "- id:7 | tops | Blue shirt [colors: blue, seasons: summer]"

    first_response = MagicMock()
    first_response.content = (
        'Action: get_wardrobe_catalog\n'
        'Action Input: {"person_label": "garrett"}\n'
    )
    # Model gives Final Answer but forgets [ITEMS:] tag
    second_response = MagicMock()
    second_response.content = "Final Answer: Wear the blue shirt."
    # After correction, model includes the tag
    third_response = MagicMock()
    third_response.content = "Final Answer: Wear the blue shirt. [ITEMS:7]"

    with patch("agents.wardrobe._get_llm") as mock_llm, \
         patch.dict("agents.wardrobe._TOOLS", {"get_wardrobe_catalog": tool_mock}):
        mock_llm.return_value.invoke.side_effect = [first_response, second_response, third_response]
        result = wardrobe.run_agent("What should Garrett wear?")

    assert mock_llm.return_value.invoke.call_count == 3
    assert "[ITEMS:7]" in result


def test_run_agent_forces_retry_when_all_ids_are_hallucinated():
    """If the model includes [ITEMS:...] but ALL IDs are hallucinated (not in observations),
    the filter strips the tag and a correction is injected with the real IDs."""
    tool_mock = MagicMock()
    tool_mock.invoke.return_value = "- id:7 | tops | Blue shirt [colors: blue, seasons: summer]"

    first_response = MagicMock()
    first_response.content = (
        'Action: get_wardrobe_catalog\n'
        'Action Input: {"person_label": "garrett"}\n'
    )
    # Model invents an ID that wasn't in the observation
    second_response = MagicMock()
    second_response.content = "Final Answer: Wear the white shirt. [ITEMS:99]"
    # After correction, model uses the real ID
    third_response = MagicMock()
    third_response.content = "Final Answer: Wear the blue shirt. [ITEMS:7]"

    with patch("agents.wardrobe._get_llm") as mock_llm, \
         patch.dict("agents.wardrobe._TOOLS", {"get_wardrobe_catalog": tool_mock}):
        mock_llm.return_value.invoke.side_effect = [first_response, second_response, third_response]
        result = wardrobe.run_agent("What should Garrett wear?")

    assert mock_llm.return_value.invoke.call_count == 3
    assert "[ITEMS:7]" in result
    assert "99" not in result


def test_run_agent_calls_tool_and_continues():
    tool_mock = MagicMock()
    # Observation contains id:3 so it passes the hallucination filter
    tool_mock.invoke.return_value = "- id:3 | outerwear | Blue blazer [colors: blue, seasons: fall]"

    first_response = MagicMock()
    first_response.content = (
        "Thought: Need catalog.\n"
        'Action: get_wardrobe_catalog\n'
        'Action Input: {"person_label": "garrett"}\n'
    )
    second_response = MagicMock()
    second_response.content = "Final Answer: Wear the blue blazer. [ITEMS:3]"

    with patch("agents.wardrobe._get_llm") as mock_llm, \
         patch.dict("agents.wardrobe._TOOLS", {"get_wardrobe_catalog": tool_mock}):
        mock_llm.return_value.invoke.side_effect = [first_response, second_response]
        result = wardrobe.run_agent("What should Garrett wear?")

    tool_mock.invoke.assert_called_once_with({"person_label": "garrett"})
    assert "blue blazer" in result
    assert "[ITEMS:3]" in result


def test_run_agent_returns_content_when_no_action_or_final_answer():
    with patch("agents.wardrobe._get_llm") as mock_llm:
        mock_response = MagicMock()
        mock_response.content = "I don't know what to do."
        mock_llm.return_value.invoke.return_value = mock_response

        result = wardrobe.run_agent("What should Garrett wear?")

    assert result == "I don't know what to do."
