import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from server.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@patch("server.routes.chat.pipeline")
def test_returns_answer_and_sources(mock_pipeline, client):
    mock_pipeline.ainvoke = AsyncMock(return_value={
        "answer": "Alice was born in 2010.",
        "sources": ["family.md"],
    })
    response = client.post("/api/chat", json={"message": "When was Alice born?"})
    assert response.status_code == 200
    data = response.json()
    assert data["answer"] == "Alice was born in 2010."
    assert data["sources"] == ["family.md"]


@patch("server.routes.chat.pipeline")
def test_passes_message_and_history_to_pipeline(mock_pipeline, client):
    mock_pipeline.ainvoke = AsyncMock(return_value={"answer": "ok", "sources": []})
    history = [{"role": "user", "content": "hello"}]
    client.post("/api/chat", json={"message": "next question", "history": history})
    called_with = mock_pipeline.ainvoke.call_args[0][0]
    assert called_with["question"] == "next question"
    assert called_with["history"] == history


@patch("server.routes.chat.pipeline")
def test_history_defaults_to_empty_list(mock_pipeline, client):
    mock_pipeline.ainvoke = AsyncMock(return_value={"answer": "ok", "sources": []})
    client.post("/api/chat", json={"message": "hello"})
    called_with = mock_pipeline.ainvoke.call_args[0][0]
    assert called_with["history"] == []


@patch("server.routes.chat.pipeline")
def test_missing_message_returns_422(mock_pipeline, client):
    response = client.post("/api/chat", json={})
    assert response.status_code == 422
