"""Orchestrate gather -> specialists (parallel) -> boss; year-pack path."""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from typing import Any, Callable

from innsight_model.memo import build_year_memo, generate_narrative
from innsight_model.sim import (
    BuildingConfig,
    Comparison,
    SCENARIOS,
    StressScenario,
    compare,
)

from app.agents.gather import DEFAULT_SITE_LAT, DEFAULT_SITE_LNG, gather_all
from app.agents.llm import LLMProvider, get_provider, truncate_matrix_for_llm
from app.agents.matrix import (
    BASELINE_SCENARIO,
    YEAR_SCENARIO_KEYS,
    build_matrix_summary,
)
from app.agents.schemas import (
    AgentBrief,
    BossSynthesis,
    BriefingResponse,
    YearBriefingResponse,
)
from app.agents.specialists.boss import synthesize_boss, synthesize_year_boss
from app.agents.specialists.compliance import analyze_compliance
from app.agents.specialists.environment import analyze_environment
from app.agents.specialists.friction import analyze_friction
from app.agents.specialists.green_ratio import analyze_green_ratio
from app.agents.specialists.market import analyze_market
from app.agents.specialists.neighborhood import analyze_neighborhood
from app.climate_extremes import fetch_location_year_scenarios

SPECIALISTS: dict[str, Callable[[LLMProvider, dict[str, Any]], AgentBrief]] = {
    "market": analyze_market,
    "environment": analyze_environment,
    "neighborhood": analyze_neighborhood,
    "green_ratio": analyze_green_ratio,
    "friction": analyze_friction,
    "compliance": analyze_compliance,
}

ALL_AGENT_IDS = list(SPECIALISTS.keys())


def _serialize_comparison(comparison: Comparison) -> dict[str, Any]:
    payload = asdict(comparison)
    payload["option_a"]["config"] = asdict(comparison.option_a.config)
    payload["option_b"]["config"] = asdict(comparison.option_b.config)
    return payload


def _build_configs(
    building_type: str,
    rooms: int,
    structure_a: str,
    hvac_a: str,
    structure_b: str,
    hvac_b: str,
) -> tuple[BuildingConfig, BuildingConfig]:
    config_a = BuildingConfig(
        building_type,
        rooms,
        structure_a,
        hvac_a,
        "Option A: Concrete + Central HVAC"
        if structure_a == "concrete" and hvac_a == "central_gas"
        else f"Option A: {structure_a} + {hvac_a}",
    )
    config_b = BuildingConfig(
        building_type,
        rooms,
        structure_b,
        hvac_b,
        "Option B: Mass Timber + Heat Pumps"
        if structure_b == "mass_timber" and hvac_b == "heat_pump"
        else f"Option B: {structure_b} + {hvac_b}",
    )
    return config_a, config_b


def _run_specialists(
    provider: LLMProvider,
    ctx: dict[str, Any],
    include: list[str],
) -> dict[str, AgentBrief]:
    selected = [aid for aid in include if aid in SPECIALISTS]

    def _one(agent_id: str) -> tuple[str, AgentBrief]:
        return agent_id, SPECIALISTS[agent_id](provider, ctx)

    briefs: dict[str, AgentBrief] = {}
    with ThreadPoolExecutor(max_workers=max(1, len(selected))) as pool:
        for agent_id, brief in pool.map(_one, selected):
            briefs[agent_id] = brief
    return briefs


def _parallel_compares(
    config_a: BuildingConfig,
    config_b: BuildingConfig,
    scenarios: dict[str, StressScenario] | None = None,
) -> dict[str, Comparison]:
    pack = scenarios if scenarios is not None else SCENARIOS
    keys = [k for k in YEAR_SCENARIO_KEYS if k in pack]

    def _one(key: str) -> tuple[str, Comparison]:
        return key, compare(config_a, config_b, pack[key])

    out: dict[str, Comparison] = {}
    with ThreadPoolExecutor(max_workers=max(1, len(keys))) as pool:
        for key, comparison in pool.map(_one, keys):
            out[key] = comparison
    return out


def _normalize_climate_meta(meta: dict[str, Any] | None) -> dict[str, Any] | None:
    """Bridge climate_extremes meta → UI/memo fields (peaks_c, live|benchmark)."""
    if not meta:
        return None
    peaks: dict[str, float] = {}
    picks = meta.get("picks") or {}
    for key, info in picks.items():
        if not isinstance(info, dict):
            continue
        if info.get("peak_c") is not None:
            peaks[key] = float(info["peak_c"])
        elif info.get("floor_c") is not None:
            peaks[key] = float(info["floor_c"])
    if not peaks:
        if meta.get("heatwave_peak_c") is not None:
            peaks["heatwave_full"] = float(meta["heatwave_peak_c"])
        if meta.get("deep_cold_floor_c") is not None:
            peaks["deep_cold_full"] = float(meta["deep_cold_floor_c"])

    fallback = bool(meta.get("fallback"))
    archive_start = meta.get("archive_start") or ""
    archive_year = None
    if isinstance(archive_start, str) and len(archive_start) >= 4:
        try:
            archive_year = int(archive_start[:4])
        except ValueError:
            archive_year = None

    note = meta.get("note")
    if not note:
        if fallback:
            note = (
                "Open-Meteo archive unavailable; using curated Toronto extreme "
                "weekends. Not a full 8760h weather year."
            )
        else:
            note = (
                "Local extreme 48h weekends from Open-Meteo historical archive "
                "(ERA5). Not a full 8760h weather simulation; annual energy "
                "stays CBECS averages."
            )

    return {
        **meta,
        "source": "benchmark" if fallback else "live",
        "provider": meta.get("source"),
        "note": note,
        "peaks_c": peaks,
        "archive_year": archive_year,
    }


async def _load_location_pack(
    lat: float | None,
    lng: float | None,
) -> tuple[dict[str, StressScenario], dict[str, Any] | None]:
    site_lat = DEFAULT_SITE_LAT if lat is None else lat
    site_lng = DEFAULT_SITE_LNG if lng is None else lng
    loc = await fetch_location_year_scenarios(site_lat, site_lng)
    pack = loc.get("scenarios") or dict(SCENARIOS)
    meta = _normalize_climate_meta(loc.get("meta"))
    return pack, meta


async def run_briefing(
    *,
    building_type: str,
    rooms: int,
    scenario: str = "heatwave_full",
    structure_a: str = "concrete",
    hvac_a: str = "central_gas",
    structure_b: str = "mass_timber",
    hvac_b: str = "heat_pump",
    include_agents: list[str] | None = None,
    provider: LLMProvider | None = None,
    lat: float | None = None,
    lng: float | None = None,
) -> BriefingResponse:
    site_lat = DEFAULT_SITE_LAT if lat is None else lat
    site_lng = DEFAULT_SITE_LNG if lng is None else lng
    pack, climate_meta = await _load_location_pack(site_lat, site_lng)

    if scenario not in pack:
        raise ValueError(f"unknown scenario: {scenario}")

    config_a, config_b = _build_configs(
        building_type, rooms, structure_a, hvac_a, structure_b, hvac_b
    )
    comparison = compare(config_a, config_b, pack[scenario])
    ctx = await gather_all(
        comparison, lat=site_lat, lng=site_lng, climate=climate_meta
    )
    if climate_meta:
        env = ctx.setdefault("environment", {})
        env["heatwave_peak_c"] = climate_meta.get("heatwave_peak_c") or (
            (climate_meta.get("peaks_c") or {}).get("heatwave_full")
        )
        env["heatwave_source"] = climate_meta.get("url") or climate_meta.get(
            "provider"
        )
        env["climate_meta"] = climate_meta

    llm, fallback_reason = (provider, None) if provider is not None else get_provider()
    include = include_agents or ALL_AGENT_IDS
    briefs = _run_specialists(llm, ctx, include)
    synthesis: BossSynthesis = synthesize_boss(llm, ctx["comparison"], briefs)

    return BriefingResponse(
        comparison=_serialize_comparison(comparison),
        briefs=briefs,
        synthesis=synthesis,
        generator=llm.name,
        fallback_reason=fallback_reason,
    )


async def run_year_briefing(
    *,
    building_type: str,
    rooms: int,
    structure_a: str = "concrete",
    hvac_a: str = "central_gas",
    structure_b: str = "mass_timber",
    hvac_b: str = "heat_pump",
    include_agents: list[str] | None = None,
    provider: LLMProvider | None = None,
    site_name: str = "45 The Esplanade, Toronto",
    lat: float | None = None,
    lng: float | None = None,
) -> YearBriefingResponse:
    """Run all year scenarios in parallel; one gather; ~8 Gemini calls total."""
    site_lat = DEFAULT_SITE_LAT if lat is None else lat
    site_lng = DEFAULT_SITE_LNG if lng is None else lng

    config_a, config_b = _build_configs(
        building_type, rooms, structure_a, hvac_a, structure_b, hvac_b
    )
    pack, climate_meta = await _load_location_pack(site_lat, site_lng)
    comparisons = _parallel_compares(config_a, config_b, pack)
    if BASELINE_SCENARIO not in comparisons:
        raise ValueError(f"missing baseline scenario {BASELINE_SCENARIO}")

    primary = comparisons[BASELINE_SCENARIO]
    matrix_summary = build_matrix_summary(comparisons)
    if climate_meta:
        matrix_summary["climate"] = climate_meta

    ctx = await gather_all(
        primary, lat=site_lat, lng=site_lng, climate=climate_meta
    )
    ctx["matrix_summary"] = truncate_matrix_for_llm(matrix_summary)
    ctx["year_pack"] = True
    ctx["climate"] = climate_meta
    if climate_meta:
        env = ctx.setdefault("environment", {})
        env["heatwave_peak_c"] = climate_meta.get("heatwave_peak_c") or (
            (climate_meta.get("peaks_c") or {}).get("heatwave_full")
        )
        env["heatwave_source"] = climate_meta.get("url") or climate_meta.get(
            "provider"
        )
        env["climate_meta"] = climate_meta

    llm, fallback_reason = (provider, None) if provider is not None else get_provider()
    include = include_agents or ALL_AGENT_IDS
    briefs = _run_specialists(llm, ctx, include)
    synthesis = synthesize_year_boss(llm, matrix_summary, briefs, ctx["comparison"])

    memo_body = build_year_memo(comparisons, site_name, matrix_summary)
    memo_body.setdefault("environmental_summary", {})
    memo_body["environmental_summary"]["climate"] = climate_meta
    memo_body["environmental_summary"]["site"] = {
        "name": site_name,
        "lat": site_lat,
        "lng": site_lng,
    }

    api_key = None
    if llm.name != "deterministic-fallback" and not fallback_reason:
        api_key = (os.environ.get("GEMINI_API_KEY") or "").strip() or None

    narrative = generate_narrative(memo_body, api_key)
    if fallback_reason and not narrative.get("fallback_reason"):
        narrative["fallback_reason"] = fallback_reason
    memo_body["narrative"] = narrative
    if climate_meta:
        memo_body["climate"] = climate_meta

    scenarios_payload = {
        key: _serialize_comparison(comparisons[key])
        for key in YEAR_SCENARIO_KEYS
        if key in comparisons
    }

    return YearBriefingResponse(
        scenarios=scenarios_payload,
        matrix_summary=matrix_summary,
        briefs=briefs,
        synthesis=synthesis,
        memo=memo_body,
        generator=llm.name,
        fallback_reason=fallback_reason,
        comparison=_serialize_comparison(primary),
        climate=climate_meta,
    )
