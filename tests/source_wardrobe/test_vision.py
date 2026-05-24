import json
from unittest.mock import MagicMock, patch

from source_wardrobe.vision import (
    _extract_json_object,
    describe_clothing_item,
    describe_image,
    describe_person_pose,
)


def _mock_ollama_response(content: str) -> MagicMock:
    return {"message": {"content": content}}


@patch("source_wardrobe.vision._encode_image", return_value="base64data")
@patch("source_wardrobe.vision.ollama.Client")
def test_describe_clothing_item_parses_valid_json(mock_client_cls, _mock_encode):
    payload = {
        "category": "tops",
        "colors": ["white"],
        "seasons": ["spring", "summer"],
        "occasions": ["business"],
        "description": "White slim-fit dress shirt.",
    }
    mock_client = MagicMock()
    mock_client.chat.return_value = _mock_ollama_response(json.dumps(payload))
    mock_client_cls.return_value = mock_client

    result = describe_clothing_item("/path/shirt.jpg")

    assert result["category"] == "tops"
    assert result["colors"] == ["white"]
    assert result["description"] == "White slim-fit dress shirt."


@patch("source_wardrobe.vision._encode_image", return_value="base64data")
@patch("source_wardrobe.vision.ollama.Client")
def test_describe_clothing_item_strips_markdown_fences(mock_client_cls, _mock_encode):
    payload = {"category": "bottoms", "colors": ["blue"], "seasons": [], "occasions": [], "description": "Blue jeans."}
    raw = f"```json\n{json.dumps(payload)}\n```"
    mock_client = MagicMock()
    mock_client.chat.return_value = _mock_ollama_response(raw)
    mock_client_cls.return_value = mock_client

    result = describe_clothing_item("/path/jeans.jpg")
    assert result["category"] == "bottoms"


@patch("source_wardrobe.vision._encode_image", return_value="base64data")
@patch("source_wardrobe.vision.ollama.Client")
def test_describe_clothing_item_falls_back_on_invalid_json(mock_client_cls, _mock_encode):
    mock_client = MagicMock()
    mock_client.chat.return_value = _mock_ollama_response("This is not json at all!")
    mock_client_cls.return_value = mock_client

    result = describe_clothing_item("/path/item.jpg")
    # Falls back gracefully: no exception, returns dict with empty lists
    assert isinstance(result, dict)
    assert result["category"] is None
    assert result["colors"] == []
    assert "description" in result


@patch("source_wardrobe.vision._encode_image", return_value="base64data")
@patch("source_wardrobe.vision.ollama.Client")
def test_describe_person_pose_returns_string(mock_client_cls, _mock_encode):
    mock_client = MagicMock()
    mock_client.chat.return_value = _mock_ollama_response(
        "Athletic build, average height, medium skin tone."
    )
    mock_client_cls.return_value = mock_client

    result = describe_person_pose("/path/pose.jpg")
    assert "Athletic" in result
    assert isinstance(result, str)


@patch("source_wardrobe.vision.ollama.Client")
def test_describe_image_returns_description(mock_client_cls):
    mock_client = MagicMock()
    mock_client.chat.return_value = _mock_ollama_response("A red polo shirt on a hanger.")
    mock_client_cls.return_value = mock_client

    result = describe_image("base64encodedimage")
    assert "red polo" in result


# --- _extract_json_object ---

def test_extract_json_object_finds_plain_json():
    assert _extract_json_object('{"a": 1}') == '{"a": 1}'


def test_extract_json_object_ignores_preamble():
    text = 'Based on the image, here is the JSON object:\n{"category": "tops"}'
    assert _extract_json_object(text) == '{"category": "tops"}'


def test_extract_json_object_strips_markdown_fences():
    text = '```json\n{"category": "bottoms"}\n```'
    result = _extract_json_object(text)
    assert result is not None
    assert '"bottoms"' in result


def test_extract_json_object_handles_nested_arrays():
    text = '{"colors": ["navy", "white"], "seasons": ["fall"]}'
    result = _extract_json_object(text)
    assert result is not None
    assert json.loads(result)["colors"] == ["navy", "white"]


def test_extract_json_object_returns_none_when_no_json():
    assert _extract_json_object("No JSON here at all.") is None


@patch("source_wardrobe.vision._encode_image", return_value="base64data")
@patch("source_wardrobe.vision.ollama.Client")
def test_describe_clothing_item_handles_preamble_text(mock_client_cls, _mock_encode):
    payload = {"category": "tops", "colors": ["white"], "seasons": [], "occasions": [], "description": "A shirt."}
    raw = f"Based on the image, I can provide the following:\n{json.dumps(payload)}"
    mock_client = MagicMock()
    mock_client.chat.return_value = _mock_ollama_response(raw)
    mock_client_cls.return_value = mock_client

    result = describe_clothing_item("/path/shirt.jpg")
    assert result["category"] == "tops"


@patch("source_wardrobe.vision._encode_image", return_value="base64data")
@patch("source_wardrobe.vision.ollama.Client")
def test_describe_clothing_item_calls_correct_model(mock_client_cls, _mock_encode, monkeypatch):
    monkeypatch.setenv("OLLAMA_VISION_MODEL", "llama3.2-vision:11b")
    mock_client = MagicMock()
    mock_client.chat.return_value = _mock_ollama_response(
        '{"category":"tops","colors":[],"seasons":[],"occasions":[],"description":"A shirt."}'
    )
    mock_client_cls.return_value = mock_client

    describe_clothing_item("/path/item.jpg")
    call_kwargs = mock_client.chat.call_args[1]
    assert call_kwargs["model"] == "llama3.2-vision:11b"
