"""AI inference energy estimates (no Gemini required)."""

from __future__ import annotations

import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.agents.ai_energy import (
    WH_PER_1K_TOKENS,
    resolve_grid_intensity,
    track_ai_energy,
)


def test_session_estimates_wh_and_gco2e() -> None:
    with track_ai_energy() as session:
        session.configure_grid(145.0, "benchmark")
        session.record(
            call_id="market",
            model="gemini-flash-latest",
            prompt_tokens=800,
            completion_tokens=200,
            total_tokens=1000,
        )
        session.record(
            call_id="boss",
            model="gemini-flash-latest",
            prompt_tokens=500,
            completion_tokens=500,
            total_tokens=1000,
        )
        summary = session.summarize(default_model="gemini-flash-latest")

    assert summary["call_count"] == 2
    assert summary["total_tokens"] == 2000
    assert summary["est_wh"] == round(2.0 * WH_PER_1K_TOKENS, 4)
    # 0.6 Wh → 0.0006 kWh × 145 g/kWh
    assert summary["est_gco2e"] == round((0.6 / 1000.0) * 145.0, 4)
    assert summary["estimate"] is True
    assert summary["intensity_source"] == "benchmark"
    assert [c["call_id"] for c in summary["calls"]] == ["market", "boss"]


def test_resolve_grid_prefers_live() -> None:
    intensity, source = resolve_grid_intensity(
        {"carbon_intensity": 82.5, "source": "live"}
    )
    assert intensity == 82.5
    assert source == "live"

    intensity, source = resolve_grid_intensity(
        {"carbon_intensity": None, "source": "benchmark"}
    )
    assert source == "benchmark"
    assert intensity > 0
