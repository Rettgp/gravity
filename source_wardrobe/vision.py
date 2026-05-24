import base64
import json
import os
import re
from pathlib import Path

import ollama

_ITEM_PROMPT = (
    "Analyze this clothing item image.\n\n"
    "Reply with ONLY a JSON object — no introduction, no explanation, no markdown fences.\n"
    "Start your response with { and end with }.\n\n"
    "Required fields:\n"
    '  "category": one of "tops", "bottoms", "shoes", "outerwear", "accessories", "dress", "suit"\n'
    '  "colors": array of color names present (e.g., ["navy", "white"])\n'
    '  "seasons": array from ["spring", "summer", "fall", "winter"]\n'
    '  "occasions": array from ["casual", "business", "formal", "athletic", "relax"]\n'
    '  "description": one concise sentence describing the item\n\n'
    "Example output:\n"
    '{"category": "tops", "colors": ["white"], "seasons": ["spring", "summer"], '
    '"occasions": ["casual", "business"], "description": "White cotton button-down shirt."}'
)

_POSE_PROMPT = (
    "Describe this person's physical appearance for clothing fit and style recommendations. "
    "Cover: build (slim/athletic/average/broad/petite/plus-size), height impression "
    "(short/average/tall), skin tone (light/medium/olive/tan/dark) for color coordination, "
    "and any notable posture or style observations useful for recommending cuts and fits. "
    "Return a single paragraph, plain text only."
)


def _vision_model() -> str:
    return os.environ.get("OLLAMA_VISION_MODEL", "llama3.2-vision:11b")


def _base_url() -> str:
    return os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")


def _encode_image(image_path: str) -> str:
    return base64.b64encode(Path(image_path).read_bytes()).decode()


def _extract_json_object(text: str) -> str | None:
    """Find the first complete, brace-balanced JSON object in text.

    Handles preamble prose, markdown fences, and nested structures.
    """
    # Strip markdown fences so we don't confuse { inside them
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```", "", text)

    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False
    for i, ch in enumerate(text[start:], start):
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def describe_clothing_item(image_path: str) -> dict:
    """Call the vision model to analyze a clothing item image. Returns structured metadata."""
    client = ollama.Client(host=_base_url())
    response = client.chat(
        model=_vision_model(),
        messages=[
            {
                "role": "user",
                "content": _ITEM_PROMPT,
                "images": [_encode_image(image_path)],
            }
        ],
    )
    raw = response["message"]["content"].strip()
    json_str = _extract_json_object(raw)
    if json_str:
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass
    return {
        "category": None,
        "colors": [],
        "seasons": [],
        "occasions": [],
        "description": raw[:200],
    }


def describe_person_pose(image_path: str) -> str:
    """Call the vision model to describe a person's appearance for outfit recommendations."""
    client = ollama.Client(host=_base_url())
    response = client.chat(
        model=_vision_model(),
        messages=[
            {
                "role": "user",
                "content": _POSE_PROMPT,
                "images": [_encode_image(image_path)],
            }
        ],
    )
    return response["message"]["content"].strip()


def describe_image(image_base64: str) -> str:
    """Describe an arbitrary base64-encoded image (for user-uploaded chat images)."""
    client = ollama.Client(host=_base_url())
    response = client.chat(
        model=_vision_model(),
        messages=[
            {
                "role": "user",
                "content": "Describe what you see in this image concisely.",
                "images": [image_base64],
            }
        ],
    )
    return response["message"]["content"].strip()
