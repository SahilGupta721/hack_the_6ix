"""Swappable LLM providers for agent structured JSON output."""

from __future__ import annotations

import json
import os
import threading
from typing import Any, Protocol

from pydantic import BaseModel

GEMINI_MODEL = "gemini-flash-latest"
# Cap concurrent Gemini calls to protect RPM / prepaid credits.
_GEMINI_SEM = threading.Semaphore(4)


class LLMProvider(Protocol):
    name: str

    def complete_json(
        self,
        system: str,
        user: str,
        schema: type[BaseModel],
    ) -> BaseModel: ...


class DeterministicFallbackProvider:
    """Returns empty schema instance; specialists supply their own stubs."""

    name = "deterministic-fallback"

    def complete_json(
        self,
        system: str,
        user: str,
        schema: type[BaseModel],
    ) -> BaseModel:
        return schema.model_validate({})


class GeminiProvider:
    name = GEMINI_MODEL

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def complete_json(
        self,
        system: str,
        user: str,
        schema: type[BaseModel],
    ) -> BaseModel:
        from google import genai
        from google.genai import types

        with _GEMINI_SEM:
            client = genai.Client(api_key=self._api_key)
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=f"{system}\n\n{user}",
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema,
                    temperature=0.2,
                ),
            )
        from app.agents.ai_energy import record_gemini_usage

        record_gemini_usage(response, model=GEMINI_MODEL)
        return schema.model_validate_json(response.text)


def get_provider(api_key: str | None = None) -> tuple[LLMProvider, str | None]:
    """Return (provider, probe_failure_reason).

    Probes Gemini once when a key is present so credit/auth failures surface
    instead of silently labelling the run as if no key existed.
    """
    raw = api_key if api_key is not None else os.environ.get("GEMINI_API_KEY")
    key = (raw or "").strip()
    if not key:
        return DeterministicFallbackProvider(), "no_api_key"
    provider = GeminiProvider(key)
    try:
        class _Probe(BaseModel):
            ok: bool

        from app.agents.ai_energy import call_label

        with call_label("probe"):
            provider.complete_json(
                "Reply with JSON only.",
                'Return {"ok": true}.',
                _Probe,
            )
        return provider, None
    except Exception as exc:
        reason = str(exc)
        if "RESOURCE_EXHAUSTED" in reason or "429" in reason:
            reason = (
                "gemini_credits_depleted: add billing/credits at "
                "https://aistudio.google.com/"
            )
        elif "NOT_FOUND" in reason or "no longer available" in reason:
            reason = f"gemini_model_unavailable: {GEMINI_MODEL}"
        else:
            short = reason.split(". ", 1)[0][:160]
            reason = f"gemini_error: {short}"
        return DeterministicFallbackProvider(), reason


def dumps_context(payload: Any) -> str:
    return json.dumps(payload, default=str, indent=2)


def truncate_matrix_for_llm(matrix_summary: dict[str, Any]) -> dict[str, Any]:
    """Drop bulky fields before sending scenario matrix to Gemini."""
    return {
        "recommended_by_scenario": matrix_summary.get("recommended_by_scenario"),
        "flip_scenarios": matrix_summary.get("flip_scenarios"),
        "peak_kw": matrix_summary.get("peak_kw"),
        "strain": matrix_summary.get("strain"),
        "abatement": matrix_summary.get("abatement"),
        "worst_peak_scenario": matrix_summary.get("worst_peak_scenario"),
        "coldest_hp_stress_scenario": matrix_summary.get("coldest_hp_stress_scenario"),
        "baseline_scenario": matrix_summary.get("baseline_scenario"),
    }
