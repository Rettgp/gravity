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
        "outfit_items": [],
    })
    response = client.post("/api/chat", json={"message": "When was Alice born?"})
    assert response.status_code == 200
    data = response.json()
    assert data["answer"] == "Alice was born in 2010."
    assert data["sources"] == ["family.md"]
    assert data["outfit_items"] == []


@patch("server.routes.chat.pipeline")
def test_returns_outfit_items_when_present(mock_pipeline, client):
    mock_pipeline.ainvoke = AsyncMock(return_value={
        "answer": "Wear the navy blazer.",
        "sources": [],
        "outfit_items": [
            {"item_id": 1, "label": "Navy blazer", "image_url": "/api/wardrobe/image/1", "person_label": "garrett"}
        ],
    })
    response = client.post("/api/chat", json={"message": "What should Garrett wear?"})
    assert response.status_code == 200
    data = response.json()
    assert len(data["outfit_items"]) == 1
    assert data["outfit_items"][0]["item_id"] == 1
    assert data["outfit_items"][0]["image_url"] == "/api/wardrobe/image/1"


@patch("server.routes.chat.pipeline")
def test_passes_message_and_history_to_pipeline(mock_pipeline, client):
    mock_pipeline.ainvoke = AsyncMock(return_value={
        "answer": "ok", "sources": [], "outfit_items": []
    })
    history = [{"role": "user", "content": "hello"}]
    client.post("/api/chat", json={"message": "next question", "history": history})
    called_with = mock_pipeline.ainvoke.call_args[0][0]
    assert called_with["question"] == "next question"
    assert called_with["history"] == history


@patch("server.routes.chat.pipeline")
def test_history_defaults_to_empty_list(mock_pipeline, client):
    mock_pipeline.ainvoke = AsyncMock(return_value={
        "answer": "ok", "sources": [], "outfit_items": []
    })
    client.post("/api/chat", json={"message": "hello"})
    called_with = mock_pipeline.ainvoke.call_args[0][0]
    assert called_with["history"] == []


@patch("server.routes.chat.pipeline")
def test_missing_message_returns_422(mock_pipeline, client):
    response = client.post("/api/chat", json={})
    assert response.status_code == 422


@patch("server.routes.chat.describe_image", return_value="A red polo shirt.")
@patch("server.routes.chat.pipeline")
def test_image_base64_triggers_vision_description(mock_pipeline, mock_describe, client):
    mock_pipeline.ainvoke = AsyncMock(return_value={
        "answer": "Yes, matches!", "sources": [], "outfit_items": []
    })
    response = client.post("/api/chat", json={
        "message": "Does this match?",
        "image_base64": "base64encodeddata",
        "image_media_type": "image/jpeg",
    })
    assert response.status_code == 200
    mock_describe.assert_called_once_with("base64encodeddata")
    called_state = mock_pipeline.ainvoke.call_args[0][0]
    assert called_state["image_description"] == "A red polo shirt."


@patch("server.routes.chat.describe_image", side_effect=RuntimeError("vision unavailable"))
@patch("server.routes.chat.pipeline")
def test_vision_error_does_not_fail_request(mock_pipeline, mock_describe, client):
    mock_pipeline.ainvoke = AsyncMock(return_value={
        "answer": "ok", "sources": [], "outfit_items": []
    })
    response = client.post("/api/chat", json={
        "message": "Does this match?",
        "image_base64": "base64data",
    })
    assert response.status_code == 200
    called_state = mock_pipeline.ainvoke.call_args[0][0]
    assert called_state["image_description"] is None
