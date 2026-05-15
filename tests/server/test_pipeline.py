from unittest.mock import MagicMock, patch
from langchain_core.documents import Document
from server.pipeline import _retrieve, _generate, ChatState


def _state(**kwargs) -> ChatState:
    base: ChatState = {"question": "", "history": [], "context": "", "sources": [], "answer": ""}
    base.update(kwargs)
    return base


@patch("server.pipeline.similarity_search")
@patch("server.pipeline.get_embedder")
def test_retrieve_sets_context_from_docs(mock_get_embedder, mock_search):
    mock_search.return_value = [
        Document(page_content="family recipe", metadata={"source": "recipes.md"}),
    ]
    result = _retrieve(_state(question="recipe"))
    assert result["context"] == "family recipe"


@patch("server.pipeline.similarity_search")
@patch("server.pipeline.get_embedder")
def test_retrieve_joins_multiple_docs_with_newlines(mock_get_embedder, mock_search):
    mock_search.return_value = [
        Document(page_content="part one", metadata={"source": "a.md"}),
        Document(page_content="part two", metadata={"source": "b.md"}),
    ]
    result = _retrieve(_state(question="question"))
    assert "part one" in result["context"]
    assert "part two" in result["context"]


@patch("server.pipeline.similarity_search")
@patch("server.pipeline.get_embedder")
def test_retrieve_collects_sources(mock_get_embedder, mock_search):
    mock_search.return_value = [
        Document(page_content="x", metadata={"source": "a.md"}),
        Document(page_content="y", metadata={"source": "b.md"}),
    ]
    result = _retrieve(_state(question="q"))
    assert result["sources"] == ["a.md", "b.md"]


@patch("server.pipeline._get_llm")
def test_generate_sets_answer_from_llm_response(mock_get_llm):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "The answer is 42."
    mock_get_llm.return_value = mock_llm
    result = _generate(_state(question="what is the answer?", context="42 is the answer"))
    assert result["answer"] == "The answer is 42."


@patch("server.pipeline._get_llm")
def test_generate_includes_history_messages(mock_get_llm):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "response"
    mock_get_llm.return_value = mock_llm
    _generate(_state(
        question="follow up?",
        context="ctx",
        history=[
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
        ],
    ))
    messages = mock_llm.invoke.call_args[0][0]
    # system prompt + 2 history turns + current question = 4 messages
    assert len(messages) == 4


@patch("server.pipeline._get_llm")
def test_generate_invokes_llm_exactly_once(mock_get_llm):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "ok"
    mock_get_llm.return_value = mock_llm
    _generate(_state(question="q", context="ctx"))
    mock_llm.invoke.assert_called_once()
