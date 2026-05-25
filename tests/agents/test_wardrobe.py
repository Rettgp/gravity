from unittest.mock import MagicMock, patch

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


# --- _find_person_label ---

def test_find_person_label_matches_label_in_query():
    with patch("agents.wardrobe.store.get_all_persons") as mock:
        mock.return_value = [{"label": "garrett", "display_name": "Garrett"}]
        assert wardrobe._find_person_label("What should garrett wear?") == "garrett"


def test_find_person_label_matches_display_name_in_query():
    with patch("agents.wardrobe.store.get_all_persons") as mock:
        mock.return_value = [{"label": "garrett", "display_name": "Garrett"}]
        assert wardrobe._find_person_label("Outfit ideas for Garrett this summer") == "garrett"


def test_find_person_label_returns_none_when_no_match():
    with patch("agents.wardrobe.store.get_all_persons") as mock:
        mock.return_value = [{"label": "garrett", "display_name": "Garrett"}]
        assert wardrobe._find_person_label("What is the weather today?") is None


def test_find_person_label_returns_none_when_no_persons():
    with patch("agents.wardrobe.store.get_all_persons", return_value=[]):
        assert wardrobe._find_person_label("What should Garrett wear?") is None


# --- run_agent ---

_SAMPLE_PERSON = {
    "label": "garrett",
    "display_name": "Garrett",
    "pose_image_path": None,
    "pose_description": "Athletic build, average height.",
}

_SAMPLE_ITEMS = [
    {
        "id": 1, "category": "tops", "description": "Blue t-shirt",
        "colors": ["blue"], "seasons": ["summer"], "occasions": ["casual"],
    },
    {
        "id": 2, "category": "bottoms", "description": "Khaki shorts",
        "colors": ["khaki"], "seasons": ["summer"], "occasions": ["casual"],
    },
]

_GARRETT = [{"label": "garrett", "display_name": "Garrett"}]


def test_run_agent_returns_no_person_message_when_no_person_in_query():
    with patch("agents.wardrobe.store.get_all_persons", return_value=[]):
        result = wardrobe.run_agent("What should I wear today?")
    assert "name" in result.lower() or "person" in result.lower()


def test_run_agent_returns_no_items_when_catalog_empty():
    with patch("agents.wardrobe.store.get_all_persons", return_value=_GARRETT), \
         patch("agents.wardrobe.store.get_person", return_value=_SAMPLE_PERSON), \
         patch("agents.wardrobe.store.get_catalog", return_value=[]):
        result = wardrobe.run_agent("What should Garrett wear?")
    assert any(w in result.lower() for w in ["no wardrobe", "not found", "no items"])


def test_run_agent_makes_exactly_one_llm_call():
    """The pre-load approach makes a single LLM call — no ReAct loop."""
    with patch("agents.wardrobe.store.get_all_persons", return_value=_GARRETT), \
         patch("agents.wardrobe.store.get_person", return_value=_SAMPLE_PERSON), \
         patch("agents.wardrobe.store.get_catalog", return_value=_SAMPLE_ITEMS), \
         patch("agents.wardrobe._get_llm") as mock_llm:
        mock_llm.return_value.invoke.return_value = MagicMock(content="Great summer look. [ITEMS:1,2]")
        result = wardrobe.run_agent("What should Garrett wear in summer?")
    assert mock_llm.return_value.invoke.call_count == 1
    assert "[ITEMS:1,2]" in result


def test_run_agent_filters_hallucinated_ids():
    """IDs in [ITEMS:...] that are not in the catalog are removed."""
    with patch("agents.wardrobe.store.get_all_persons", return_value=_GARRETT), \
         patch("agents.wardrobe.store.get_person", return_value=_SAMPLE_PERSON), \
         patch("agents.wardrobe.store.get_catalog", return_value=_SAMPLE_ITEMS), \
         patch("agents.wardrobe._get_llm") as mock_llm:
        mock_llm.return_value.invoke.return_value = MagicMock(content="Great look. [ITEMS:1,99,100]")
        result = wardrobe.run_agent("What should Garrett wear?")
    assert "[ITEMS:1]" in result
    assert "99" not in result
    assert "100" not in result


def test_run_agent_strips_final_answer_prefix():
    """If the model wraps its response in 'Final Answer:', it is stripped."""
    with patch("agents.wardrobe.store.get_all_persons", return_value=_GARRETT), \
         patch("agents.wardrobe.store.get_person", return_value=_SAMPLE_PERSON), \
         patch("agents.wardrobe.store.get_catalog", return_value=_SAMPLE_ITEMS), \
         patch("agents.wardrobe._get_llm") as mock_llm:
        mock_llm.return_value.invoke.return_value = MagicMock(
            content="Final Answer: Great summer look. [ITEMS:1,2]"
        )
        result = wardrobe.run_agent("What should Garrett wear?")
    assert "Final Answer:" not in result
    assert "[ITEMS:1,2]" in result


def test_run_agent_catalog_injected_as_context_not_tool_called():
    """The catalog is loaded programmatically and passed as LLM context.
    No wardrobe tool functions are invoked during run_agent."""
    with patch("agents.wardrobe.store.get_all_persons", return_value=_GARRETT), \
         patch("agents.wardrobe.store.get_person", return_value=_SAMPLE_PERSON), \
         patch("agents.wardrobe.store.get_catalog", return_value=_SAMPLE_ITEMS) as mock_catalog, \
         patch("agents.wardrobe._get_llm") as mock_llm, \
         patch("agents.wardrobe.get_wardrobe_catalog") as mock_tool:
        mock_llm.return_value.invoke.return_value = MagicMock(content="Nice. [ITEMS:1]")
        wardrobe.run_agent("What should Garrett wear?")
    mock_catalog.assert_called_once_with("garrett")   # store called directly
    mock_tool.invoke.assert_not_called()              # LangChain tool NOT invoked


def test_run_agent_emits_profile_and_catalog_steps():
    """on_step receives action+observation events for both profile and catalog loading."""
    collected: list[dict] = []
    with patch("agents.wardrobe.store.get_all_persons", return_value=_GARRETT), \
         patch("agents.wardrobe.store.get_person", return_value=_SAMPLE_PERSON), \
         patch("agents.wardrobe.store.get_catalog", return_value=_SAMPLE_ITEMS), \
         patch("agents.wardrobe._get_llm") as mock_llm:
        mock_llm.return_value.invoke.return_value = MagicMock(content="Looks great. [ITEMS:1]")
        wardrobe.run_agent("What should Garrett wear?", on_step=collected.append)

    tools_called = [s["tool"] for s in collected if s.get("step_type") == "action"]
    assert "get_person_profile" in tools_called
    assert "get_wardrobe_catalog" in tools_called
    observations = [s for s in collected if s.get("step_type") == "observation"]
    assert len(observations) >= 2
