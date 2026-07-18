"""Scenario comparison matrix helpers for year-pack stress."""

from __future__ import annotations

from typing import Any

from innsight_model.sim import Comparison

# Ordered to match web/lib/scenarios.ts
YEAR_SCENARIO_KEYS: list[str] = [
    "heatwave_full",
    "summer_shoulder",
    "typical_weekend",
    "winter_typical",
    "deep_cold_full",
]

BASELINE_SCENARIO = "heatwave_full"


def build_matrix_summary(
    comparisons: dict[str, Comparison],
) -> dict[str, Any]:
    recommended_by: dict[str, str] = {
        key: comparisons[key].recommended for key in YEAR_SCENARIO_KEYS if key in comparisons
    }
    baseline_rec = recommended_by.get(BASELINE_SCENARIO, "A")
    flip_scenarios = [
        key for key, rec in recommended_by.items() if rec != baseline_rec
    ]

    peak_kw: dict[str, dict[str, float]] = {}
    strain: dict[str, dict[str, str]] = {}
    abatement: dict[str, float | None] = {}
    for key in YEAR_SCENARIO_KEYS:
        if key not in comparisons:
            continue
        c = comparisons[key]
        peak_kw[key] = {
            "A": c.option_a.peak_kw,
            "B": c.option_b.peak_kw,
        }
        strain[key] = {
            "A": c.option_a.strain_class,
            "B": c.option_b.strain_class,
        }
        abatement[key] = c.abatement_cost

    def _max_peak(key: str) -> float:
        p = peak_kw.get(key) or {"A": 0.0, "B": 0.0}
        return max(p["A"], p["B"])

    worst_peak = max(peak_kw.keys(), key=_max_peak) if peak_kw else BASELINE_SCENARIO

    # HP stress: where Option B peak exceeds A (typical gas vs HP heating flip).
    coldest_hp = BASELINE_SCENARIO
    best_spread = float("-inf")
    for key, peaks in peak_kw.items():
        spread = peaks["B"] - peaks["A"]
        if spread > best_spread:
            best_spread = spread
            coldest_hp = key

    return {
        "recommended_by_scenario": recommended_by,
        "flip_scenarios": flip_scenarios,
        "peak_kw": peak_kw,
        "strain": strain,
        "abatement": abatement,
        "worst_peak_scenario": worst_peak,
        "coldest_hp_stress_scenario": coldest_hp,
        "baseline_scenario": BASELINE_SCENARIO,
        "baseline_recommended": baseline_rec,
    }
