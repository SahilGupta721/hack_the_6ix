"""Estimate agent-inference energy and CO2e for honesty / Green AI accountability.

Token counts come from Gemini usage_metadata when present. Energy and gCO2e are
labelled estimates: flash-class Wh/token is not a published vendor figure, and
grid intensity uses live Electricity Maps when available else TAF Ontario avg.
"""

from __future__ import annotations

import threading
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Iterator

from innsight_model import benchmarks as B

# Conservative order-of-magnitude for small/flash cloud LLM inference.
# Public ML-carbon calculators often cite ~0.2–0.5 Wh per 1k tokens for mid-size
# models; Flash-class is likely lower. We use 0.3 Wh/1k as a conservative
# estimate so the demo does not understate agent footprint. ESTIMATE.
WH_PER_1K_TOKENS = 0.3
METHOD_NOTE = (
    f"est. {WH_PER_1K_TOKENS} Wh per 1k tokens (conservative flash-class "
    "inference heuristic) × grid gCO2e/kWh; not a metered vendor figure."
)

_session: ContextVar["AiEnergySession | None"] = ContextVar(
    "ai_energy_session", default=None
)
_call_label: ContextVar[str] = ContextVar("ai_energy_call_label", default="llm")


@dataclass
class AiEnergyCall:
    call_id: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    est_wh: float
    est_gco2e: float


@dataclass
class AiEnergySession:
    calls: list[AiEnergyCall] = field(default_factory=list)
    grid_intensity_g_per_kwh: float = field(
        default_factory=lambda: float(B.GRID_INTENSITY_AVG.value)
    )
    intensity_source: str = "benchmark"
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def configure_grid(
        self, intensity_g_per_kwh: float, intensity_source: str
    ) -> None:
        self.grid_intensity_g_per_kwh = float(intensity_g_per_kwh)
        self.intensity_source = intensity_source

    def record(
        self,
        *,
        call_id: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int | None = None,
    ) -> None:
        total = (
            total_tokens
            if total_tokens is not None
            else max(0, prompt_tokens) + max(0, completion_tokens)
        )
        intensity = self.grid_intensity_g_per_kwh
        est_wh = (total / 1000.0) * WH_PER_1K_TOKENS
        # Wh → kWh × g/kWh = gCO2e
        est_gco2e = (est_wh / 1000.0) * intensity
        with self._lock:
            self.calls.append(
                AiEnergyCall(
                    call_id=call_id,
                    model=model,
                    prompt_tokens=max(0, prompt_tokens),
                    completion_tokens=max(0, completion_tokens),
                    total_tokens=max(0, total),
                    est_wh=round(est_wh, 6),
                    est_gco2e=round(est_gco2e, 6),
                )
            )

    def summarize(self, *, default_model: str) -> dict[str, Any]:
        with self._lock:
            calls = list(self.calls)
        total_tokens = sum(c.total_tokens for c in calls)
        est_wh = sum(c.est_wh for c in calls)
        est_gco2e = sum(c.est_gco2e for c in calls)
        return {
            "calls": [
                {
                    "call_id": c.call_id,
                    "model": c.model,
                    "prompt_tokens": c.prompt_tokens,
                    "completion_tokens": c.completion_tokens,
                    "total_tokens": c.total_tokens,
                    "est_wh": c.est_wh,
                    "est_gco2e": c.est_gco2e,
                }
                for c in calls
            ],
            "call_count": len(calls),
            "total_tokens": total_tokens,
            "prompt_tokens": sum(c.prompt_tokens for c in calls),
            "completion_tokens": sum(c.completion_tokens for c in calls),
            "est_wh": round(est_wh, 4),
            "est_gco2e": round(est_gco2e, 4),
            "grid_intensity_g_per_kwh": self.grid_intensity_g_per_kwh,
            "intensity_source": self.intensity_source,
            "model": default_model,
            "estimate": True,
            "method_note": METHOD_NOTE,
            "status": "estimate",
        }


@contextmanager
def track_ai_energy() -> Iterator[AiEnergySession]:
    session = AiEnergySession()
    token = _session.set(session)
    try:
        yield session
    finally:
        _session.reset(token)


@contextmanager
def call_label(label: str) -> Iterator[None]:
    token = _call_label.set(label)
    try:
        yield
    finally:
        _call_label.reset(token)


def current_session() -> AiEnergySession | None:
    return _session.get()


def resolve_grid_intensity(live_grid: dict[str, Any] | None) -> tuple[float, str]:
    """Return (gCO2e/kWh, intensity_source). Prefer live Electricity Maps."""
    if live_grid:
        intensity = live_grid.get("carbon_intensity")
        if intensity is not None:
            try:
                return float(intensity), "live"
            except (TypeError, ValueError):
                pass
    return float(B.GRID_INTENSITY_AVG.value), "benchmark"


def record_gemini_usage(response: Any, *, model: str) -> None:
    """Pull usage_metadata off a google-genai response into the active session."""
    session = current_session()
    if session is None:
        return
    usage = extract_usage_dict(response)
    session.record(
        call_id=_call_label.get(),
        model=model,
        prompt_tokens=usage["prompt_tokens"],
        completion_tokens=usage["completion_tokens"],
        total_tokens=usage["total_tokens"],
    )


def record_token_usage(
    *,
    call_id: str,
    model: str,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int | None = None,
) -> None:
    session = current_session()
    if session is None:
        return
    session.record(
        call_id=call_id,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
    )


def extract_usage_dict(response: Any) -> dict[str, int]:
    usage = getattr(response, "usage_metadata", None)
    prompt = int(getattr(usage, "prompt_token_count", None) or 0) if usage else 0
    completion = (
        int(getattr(usage, "candidates_token_count", None) or 0) if usage else 0
    )
    total = int(getattr(usage, "total_token_count", None) or 0) if usage else 0
    if total <= 0:
        total = prompt + completion
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": total,
    }
