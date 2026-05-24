from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from server.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@patch("server.routes.wardrobe.get_items_by_ids")
def test_get_wardrobe_image_returns_404_when_not_found(mock_get_items, client):
    mock_get_items.return_value = []
    response = client.get("/api/wardrobe/image/999")
    assert response.status_code == 404


@patch("server.routes.wardrobe.get_items_by_ids")
def test_get_wardrobe_image_serves_file(mock_get_items, client, tmp_path):
    img = tmp_path / "shirt.jpg"
    img.write_bytes(b"fake image bytes")
    mock_get_items.return_value = [
        {"id": 1, "image_path": str(img), "description": "Blue shirt",
         "category": "tops", "seasons": [], "occasions": [], "colors": []}
    ]
    response = client.get("/api/wardrobe/image/1")
    assert response.status_code == 200
    assert response.content == b"fake image bytes"


@patch("server.routes.wardrobe.get_catalog")
def test_list_catalog_returns_items(mock_catalog, client):
    mock_catalog.return_value = [
        {"id": 1, "image_path": "/path/shirt.jpg", "description": "Blue shirt",
         "category": "tops", "seasons": ["summer"], "occasions": ["casual"], "colors": ["blue"]}
    ]
    response = client.get("/api/wardrobe/catalog/garrett")
    assert response.status_code == 200
    data = response.json()
    assert data["person_label"] == "garrett"
    assert len(data["items"]) == 1
    assert data["items"][0]["description"] == "Blue shirt"


@patch("server.routes.wardrobe.get_catalog")
def test_list_catalog_passes_filters_to_store(mock_catalog, client):
    mock_catalog.return_value = []
    client.get("/api/wardrobe/catalog/garrett?category=tops&season=summer&occasion=casual")
    mock_catalog.assert_called_once_with(
        "garrett", category="tops", season="summer", occasion="casual"
    )


@patch("server.routes.wardrobe.get_catalog")
def test_list_catalog_returns_empty_list_when_no_items(mock_catalog, client):
    mock_catalog.return_value = []
    response = client.get("/api/wardrobe/catalog/sarah")
    assert response.status_code == 200
    assert response.json()["items"] == []
