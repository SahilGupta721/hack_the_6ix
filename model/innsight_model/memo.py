"""Investor-style memo assembly.

Every number in the memo comes from the deterministic engine; every constant
behind those numbers is a Benchmark record, and this module wires them into
numbered footnotes. Gemini writes only the narrative prose over the computed
numbers (structured output, low temperature); when no key is present or the
call fails, a deterministic fallback narrative renders instead so the demo
path never depends on the network.
"""

import json
from typing import Any

from . import benchmarks as B
from .friction import friction_score, friction_terms
from .sim import Comparison, OptionResult

GEMINI_MODEL = "gemini-flash-latest"

_HVAC_PERF_KEYS = [
    "heat_pump_cop",
    "gas_boiler_efficiency",
    "cooling_eer_ratio_heat_pump",
    "gas_energy_content_kwh_m3",
]


class _Footnotes:
    def __init__(self) -> None:
        self._order: list[str] = []

    def cite(self, *keys: str) -> list[int]:
        indices = []
        for key in keys:
            if key not in self._order:
                self._order.append(key)
            indices.append(self._order.index(key) + 1)
        return indices

    def render(self) -> list[dict[str, Any]]:
        out = []
        for i, key in enumerate(self._order, start=1):
            bm = B.get(key)
            out.append(
                {
                    "index": i,
                    "key": bm.key,
                    "value": bm.value,
                    "unit": bm.unit,
                    "source": bm.source,
                    "note": bm.note,
                    "estimate": bm.estimate,
                }
            )
        return out


def _elec_rate_key(building_type: str) -> str:
    return "elec_rate_small" if building_type == "homestay" else "elec_rate_commercial"


def _gas_rate_key(building_type: str) -> str:
    return "gas_rate_small" if building_type == "homestay" else "gas_rate_commercial"


def _option_block(result: OptionResult, fn: _Footnotes) -> dict[str, Any]:
    config = result.config
    bt = config.building_type

    cost_keys = [f"cost_sqft_{bt}", f"cost_factor_{config.structure}"]
    if config.structure != "concrete":
        cost_keys.append("structure_share_of_hard_cost")
    if config.hvac == "heat_pump":
        cost_keys += [
            "hvac_capex_premium_heat_pump",
            "hvac_fixed_premium_heat_pump",
        ]

    energy_keys = [
        "hotel_elec_intensity",
        "hotel_gas_intensity_m3",
        f"eui_factor_{bt}",
        _elec_rate_key(bt),
    ]
    if result.annual_gas_m3 > 0:
        energy_keys.append(_gas_rate_key(bt))
    if result.annual_demand_cost > 0:
        energy_keys.append("demand_charge_per_kw_month")
    if config.hvac == "heat_pump":
        energy_keys += _HVAC_PERF_KEYS

    carbon_keys = [
        "grid_intensity_avg",
        f"embodied_{config.structure}",
        "building_life_years",
    ]
    if result.annual_gas_m3 > 0:
        carbon_keys.insert(1, "gas_emission_factor")

    strain_keys = [
        "peak_cooling_w_per_sqft",
        "cooling_internal_floor",
        f"feeder_capacity_{bt}",
        "hotel_base_load_share" if bt != "homestay" else "homestay_base_load_share",
        "heatwave_event_peak_c",
    ]

    block: dict[str, Any] = {
        "key": "A" if "Option A" in config.label else "B",
        "label": config.label or f"{config.structure} + {config.hvac}",
        "building_type": bt,
        "rooms": config.rooms,
        "structure": config.structure,
        "hvac": config.hvac,
        "floor_area_sqft": result.floor_area_sqft,
        "construction_cost": {
            "low": result.construction_cost_low,
            "mid": result.construction_cost,
            "high": result.construction_cost_high,
            "method": "Altus GTA hard-cost band x floor area x structure factor; "
            "range shows +/-15 percent method uncertainty.",
            "footnotes": fn.cite(*cost_keys),
        },
        "annual_energy_cost": {
            "value": round(result.annual_energy_cost + result.annual_demand_cost, 2),
            "energy_portion": result.annual_energy_cost,
            "demand_portion": result.annual_demand_cost,
            "elec_kwh": result.annual_elec_kwh,
            "gas_m3": result.annual_gas_m3,
            "footnotes": fn.cite(*energy_keys),
        },
        "annual_water": {
            "m3": result.annual_water_m3,
            "cost": result.annual_water_cost,
            "footnotes": fn.cite(
                "water_per_occupied_room_night", "avg_annual_occupancy", "water_rate"
            ),
        },
        "tco2e_per_year": {
            "operational": result.tco2e_operational,
            "embodied_amortized": result.tco2e_embodied_amortized,
            "total": result.tco2e_total,
            "footnotes": fn.cite(*carbon_keys),
        },
        "peak_grid_strain": {
            "class": result.strain_class,
            "ratio": result.strain_ratio,
            "peak_kw": result.peak_kw,
            "label": "proxy classification, see footnotes",
            "footnotes": fn.cite(*strain_keys),
        },
        "community_friction": {
            "score": friction_score(config, result),
            "terms": friction_terms(config, result),
            "label": "documented heuristic, not survey data",
            "formula": "model/friction.md",
        },
    }
    if config.structure == "mass_timber":
        block["tco2e_per_year"]["biogenic_note"] = (
            "Embodied figure is gross process emissions; net of the biogenic "
            "storage credit the range spans roughly -150 to +200 kgCO2e/m2 "
            "(shown per EN 15978 caveat, footnote "
            f"{fn.cite('timber_biogenic_net')[0]})."
        )
    return block


def build_memo(comparison: Comparison, site_name: str) -> dict[str, Any]:
    fn = _Footnotes()
    option_a = _option_block(comparison.option_a, fn)
    option_b = _option_block(comparison.option_b, fn)

    decision_footnotes = fn.cite(
        "abatement_threshold", "payback_horizon_years", "energy_price_escalation"
    )

    memo: dict[str, Any] = {
        "title": f"Comparative development memo: {site_name}",
        "scenario": comparison.scenario_name,
        "options": [option_a, option_b],
        "comparison": {
            "capex_delta": comparison.capex_delta,
            "annual_cost_delta": comparison.annual_cost_delta,
            "tco2e_delta": comparison.tco2e_delta,
            "payback_years": comparison.payback_years,
            "abatement_cost": comparison.abatement_cost,
            "abatement_threshold": comparison.abatement_threshold,
            "recommended": comparison.recommended,
            "footnotes": decision_footnotes,
        },
        "reasoning_chain": list(comparison.reasoning),
        "footnotes": fn.render(),
    }
    return memo


_YEAR_ORDER = [
    "heatwave_full",
    "summer_shoulder",
    "typical_weekend",
    "winter_typical",
    "deep_cold_full",
]


def build_year_memo(
    comparisons: dict[str, Comparison],
    site_name: str,
    matrix_summary: dict[str, Any],
) -> dict[str, Any]:
    """Portfolio memo over the year-pack matrix (one narrative, not five)."""
    primary = comparisons.get("heatwave_full") or next(iter(comparisons.values()))
    memo = build_memo(primary, site_name)
    memo["title"] = f"Year-pack portfolio memo: {site_name}"
    memo["scenario"] = "Year pack (5 extreme weekends)"
    memo["kind"] = "year_pack"

    portfolio_table: list[dict[str, Any]] = []
    for key in _YEAR_ORDER:
        if key not in comparisons:
            continue
        c = comparisons[key]
        portfolio_table.append(
            {
                "scenario_key": key,
                "scenario_name": c.scenario_name,
                "peak_kw_a": c.option_a.peak_kw,
                "peak_kw_b": c.option_b.peak_kw,
                "strain_a": c.option_a.strain_class,
                "strain_b": c.option_b.strain_class,
                "abatement_cost": c.abatement_cost,
                "recommended": c.recommended,
                # Printable 48h curves for the memo / Green AI stress appendix.
                "hourly_kw_a": list(c.option_a.hourly_kw),
                "hourly_kw_b": list(c.option_b.hourly_kw),
            }
        )
    memo["portfolio_table"] = portfolio_table
    memo["matrix_summary"] = {
        "flip_scenarios": matrix_summary.get("flip_scenarios"),
        "worst_peak_scenario": matrix_summary.get("worst_peak_scenario"),
        "coldest_hp_stress_scenario": matrix_summary.get(
            "coldest_hp_stress_scenario"
        ),
        "recommended_by_scenario": matrix_summary.get("recommended_by_scenario"),
        "baseline_recommended": matrix_summary.get("baseline_recommended"),
    }
    memo["environmental_summary"] = {
        "tco2e_a": primary.option_a.tco2e_total,
        "tco2e_b": primary.option_b.tco2e_total,
        "tco2e_delta": primary.tco2e_delta,
        "abatement_cost": primary.abatement_cost,
        "abatement_threshold": primary.abatement_threshold,
        "worst_peak_scenario": matrix_summary.get("worst_peak_scenario"),
        "coldest_hp_stress_scenario": matrix_summary.get(
            "coldest_hp_stress_scenario"
        ),
        "note": (
            "Green AI track: carbon and peak-grid outcomes are computed by the "
            "deterministic sim; LLM text only narrates those figures."
        ),
    }

    flips = matrix_summary.get("flip_scenarios") or []
    cold = matrix_summary.get("coldest_hp_stress_scenario")
    chain = list(memo["reasoning_chain"])
    chain.append(
        "Year pack covers five extreme 48h weekends in parallel, not a full "
        "8760h weather year; annual energy remains CBECS averages."
    )
    if flips:
        chain.append(
            f"Recommendation differs from the heat-wave baseline in: "
            f"{', '.join(flips)}."
        )
    else:
        chain.append(
            "Recommendation is stable across all five extreme-weekend scenarios."
        )
    if cold:
        chain.append(
            f"Highest Option B peak relative to A occurs in {cold} "
            "(watch heat-pump feeder stress in cold snaps)."
        )
    memo["reasoning_chain"] = chain
    return memo


# ---------------------------------------------------------------------------
# Narrative
# ---------------------------------------------------------------------------

_FALLBACK_CAVEATS = [
    "The community friction score is a documented heuristic, not survey data "
    "(model/friction.md).",
    "Building geometry is illustrative massing, not permit-ready drawings.",
    "Grid strain classes use published factors as a proxy, not utility "
    "telemetry.",
    "Constants marked as estimates in the footnotes carry their derivation "
    "reasoning in place of a direct source.",
]


def _fallback_narrative(
    memo: dict[str, Any], *, reason: str = "no_api_key"
) -> dict[str, Any]:
    rec = memo["comparison"]["recommended"]
    winner = next(o for o in memo["options"] if o["key"] == rec)
    chain = memo["reasoning_chain"]
    if memo.get("kind") == "year_pack":
        mx = memo.get("matrix_summary") or {}
        flips = mx.get("flip_scenarios") or []
        summary = (
            f"Option {rec} ({winner['label'].split(': ', 1)[-1]}) is the "
            f"heat-wave baseline pick in the year pack. "
            + (
                f"Flips in {', '.join(flips)}. "
                if flips
                else "Pick is stable across five extreme weekends. "
            )
            + "Not a full 8760h simulation."
        )
        caveats = _FALLBACK_CAVEATS + [
            "Year pack uses parallel extreme weekends, not continuous annual weather.",
        ]
        return {
            "summary": summary.strip(),
            "reasoning": chain[-5:] if len(chain) > 5 else chain,
            "caveats": caveats,
            "generator": "deterministic-fallback",
            "fallback_reason": reason,
        }
    return {
        "summary": (
            f"Option {rec} ({winner['label'].split(': ', 1)[-1]}) is the "
            f"recommended configuration under the '{memo['scenario']}' stress "
            f"case. {chain[-2] if len(chain) >= 2 else ''}"
        ).strip(),
        "reasoning": chain[:-1],
        "caveats": _FALLBACK_CAVEATS,
        "generator": "deterministic-fallback",
        "fallback_reason": reason,
    }


def generate_narrative(
    memo: dict[str, Any], api_key: str | None
) -> dict[str, Any]:
    """Gemini structured-output narrative with a deterministic fallback."""
    key = (api_key or "").strip()
    if not key:
        return _fallback_narrative(memo, reason="no_api_key")
    try:
        from google import genai
        from google.genai import types
        from pydantic import BaseModel

        class MemoNarrative(BaseModel):
            summary: str
            reasoning: list[str]
            caveats: list[str]

        client = genai.Client(api_key=key)
        payload = {k: v for k, v in memo.items() if k != "footnotes"}
        if memo.get("kind") == "year_pack":
            prompt = (
                "You are writing the portfolio recommendation for an INN-SIGHT "
                "year-pack memo (five extreme weekends in parallel, not 8760h). "
                "Tone: calm lender credit memo. Canadian spelling. No em dashes. "
                "Use ONLY numbers in the JSON. Name the heat-wave baseline pick, "
                "note any recommendation flips, and call out winter heat-pump "
                "feeder stress if the matrix shows it. Summary: one short "
                "paragraph. Reasoning: three to five numbered facts from the "
                "portfolio_table / matrix_summary. Caveats: include that this is "
                "not a full-year weather simulation and friction is a heuristic.\n\n"
                + json.dumps(payload)
            )
        else:
            prompt = (
                "You are writing the recommendation section of an investor-style "
                "development memo for a hospitality project in Toronto. Tone: calm, "
                "professional, zero hype, like a lender's credit memo. Canadian "
                "spelling. Do not use em dashes. Use ONLY numbers that appear in "
                "the JSON below; never invent a figure. Reference the existing "
                "footnote indices in square brackets where the JSON provides them. "
                "Summary: one short paragraph naming the recommended option and "
                "the single strongest quantified reason. Reasoning: three to five "
                "single-sentence items, each anchored on a number from the JSON. "
                "Caveats: two to four honest limits, including that the community "
                "friction score is a documented heuristic and not survey data.\n\n"
                + json.dumps(payload)
            )
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=MemoNarrative,
                temperature=0.2,
            ),
        )
        narrative = MemoNarrative.model_validate_json(response.text)
        return {
            "summary": narrative.summary,
            "reasoning": narrative.reasoning,
            "caveats": narrative.caveats,
            "generator": GEMINI_MODEL,
        }
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
            # Keep a short actionable snippet (status + message), not the full dump.
            short = reason.split(". ", 1)[0][:160]
            reason = f"gemini_error: {short}"
        return _fallback_narrative(memo, reason=reason)
