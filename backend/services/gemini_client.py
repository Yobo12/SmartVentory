"""
Thin client for the Google Gemini API (text generation only).

Deliberately isolated from business logic (services/ai_service.py) so a
missing API key or a network failure degrades gracefully instead of
crashing anything else. NOTE: this could not be tested end-to-end in the
environment this project was built in (no outbound network access to
Google's API there) — verify the actual API call on your own machine
once GEMINI_API_KEY is set in .env.
"""

import httpx

from config.settings import settings

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_MODEL = "gemini-3.1-flash-lite"  # change here if Google deprecates this model later


class GeminiNotConfiguredError(Exception):
    """Raised when GEMINI_API_KEY is missing from .env."""


class GeminiRequestError(Exception):
    """Raised when the Gemini API call itself fails (network, auth, quota, unexpected response shape)."""


def generate_insight_text(prompt: str, model: str = DEFAULT_MODEL, timeout: float = 15.0) -> str:
    """Sends a single-turn prompt to Gemini and returns the generated text."""
    if not settings.GEMINI_API_KEY:
        raise GeminiNotConfiguredError(
            "GEMINI_API_KEY is not set in .env — AI-generated text is unavailable until it's configured."
        )

    url = f"{GEMINI_API_BASE}/{model}:generateContent"
    headers = {"Content-Type": "application/json", "x-goog-api-key": settings.GEMINI_API_KEY}
    body = {"contents": [{"parts": [{"text": prompt}]}]}

    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url, headers=headers, json=body)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise GeminiRequestError(
            f"Gemini API returned an error: {exc.response.status_code} {exc.response.text}"
        ) from exc
    except httpx.RequestError as exc:
        raise GeminiRequestError(f"Could not reach the Gemini API: {exc}") from exc

    data = response.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError) as exc:
        raise GeminiRequestError(f"Unexpected Gemini API response shape: {data}") from exc
