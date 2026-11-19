from __future__ import annotations

import json
import urllib.error
import urllib.request

from .errors import ShipkitError

LOCALES = ("zh-CN", "en")
DEFAULT_MODEL = "gemini-3.5-flash-lite"
_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "notes": {
            "type": "OBJECT",
            "properties": {
                locale: {"type": "ARRAY", "items": {"type": "STRING"}} for locale in LOCALES
            },
            "required": list(LOCALES),
        }
    },
    "required": ["notes"],
}


def generate_notes(prompt: str, model: str, api_key: str | None) -> dict:
    if not api_key:
        raise ShipkitError("SHIPKIT_GEMINI_API_KEY is required")
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": _SCHEMA,
            "maxOutputTokens": 2048,
        },
    }
    request = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise ShipkitError(
            f"Gemini generation failed (HTTP {error.code}) for model {model}; "
            "check the API key and model name"
        ) from None
    except (urllib.error.URLError, TimeoutError):
        raise ShipkitError("Gemini generation failed (network or timeout); no notes written") from None
    try:
        text = result["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        raise ShipkitError("Gemini returned no valid structured notes; no notes written") from None
