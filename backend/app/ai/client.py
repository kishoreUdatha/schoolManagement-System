"""Thin wrapper around the Anthropic SDK shared by every AI feature.

Design rules for AI in this app:
* Claude drafts, people confirm. Nothing here writes to the database; the
  callers return proposals that the UI shows for review before saving
  through the normal endpoints.
* Every feature must work (or fail clearly) without an API key.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any

import anthropic

from app.config import settings

log = logging.getLogger(__name__)

# Models that support the server-side refusal fallback beta.
_FALLBACK_MODELS = {"claude-opus-5", "claude-fable-5-1"}
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AIUnavailable(Exception):
    """AI is not configured, or the call failed / was declined.

    `str(exc)` is safe to show to end users.
    """


def enabled() -> bool:
    return bool(settings.anthropic_api_key)


def model() -> str:
    return settings.claude_model


@lru_cache
def _client() -> anthropic.Anthropic:
    return anthropic.Anthropic(
        api_key=settings.anthropic_api_key, timeout=90.0, max_retries=2
    )


def create(**params: Any):
    """messages.create with the app's defaults and error mapping."""
    if not enabled():
        raise AIUnavailable("AI features are not configured on this server")
    params.setdefault("model", model())
    try:
        if params["model"] in _FALLBACK_MODELS:
            # On a policy decline the API re-runs the request on a fallback
            # model inside the same call.
            response = _client().beta.messages.create(
                betas=[_FALLBACK_BETA], fallbacks="default", **params
            )
        else:
            response = _client().messages.create(**params)
    except anthropic.RateLimitError:
        raise AIUnavailable("The AI service is busy. Please try again in a minute.")
    except anthropic.APIStatusError as e:
        log.warning("Claude API error %s: %s", e.status_code, e.message)
        raise AIUnavailable("The AI service returned an error. Please try again.")
    except anthropic.APIConnectionError:
        raise AIUnavailable("Could not reach the AI service.")

    if response.stop_reason == "refusal":
        raise AIUnavailable("The AI declined this request.")
    if response.stop_reason == "max_tokens":
        raise AIUnavailable("The AI response was too long. Try a shorter input.")
    return response


def text_of(response) -> str:
    return "".join(b.text for b in response.content if b.type == "text")


def json_call(
    *,
    system: str,
    content: str | list,
    schema: dict,
    effort: str = "low",
    max_tokens: int = 8000,
) -> dict:
    """One structured-output call; returns the parsed JSON object."""
    response = create(
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": content}],
        output_config={
            "effort": effort,
            "format": {"type": "json_schema", "schema": schema},
        },
    )
    try:
        return json.loads(text_of(response))
    except json.JSONDecodeError:
        raise AIUnavailable("The AI returned an unreadable answer. Please retry.")


def obj(properties: dict, required: list[str] | None = None) -> dict:
    """JSON-schema object helper (structured outputs need
    additionalProperties=false and an explicit required list)."""
    return {
        "type": "object",
        "properties": properties,
        "required": required if required is not None else list(properties),
        "additionalProperties": False,
    }
