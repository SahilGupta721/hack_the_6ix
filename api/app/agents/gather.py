"""Data gatherers for multi-agent briefing (Stay22, env, packs, sim context)."""

from __future__ import annotations

import json
import os
import statistics
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx
from innsight_model import benchmarks as B
from innsight_model.friction import friction_score, friction_terms
from innsight_model.sim import Comparison, OptionResult

PACKS_DIR = Path(__file__).resolve().parent / "packs"

DEFAULT_SITE_LAT = 43.6476
DEFAULT_SITE_LNG = -79.3744
# Back-compat aliases
SITE_LAT = DEFAULT_SITE_LAT
SITE_LNG = DEFAULT_SITE_LNG
STAY22_BASE = "https://api.stay22.com/v2/accommodations"

# In-process cache only (Stay22 terms: no disk / DB listing storage).
# Keyed by rounded (lat, lng) so relocating the pin does not reuse the wrong sample.
_last_stay22: dict[tuple[float, float], dict[str, Any]] = {}


def _coord_key(lat: float, lng: float) -> tuple[float, float]:
    return (round(lat, 3), round(lng, 3))


def _next_saturday() -> date:
    today = date.today()
    return today + timedelta(days=(5 - today.weekday()) % 7 or 7)


def _ontario_ish(lat: float, lng: float) -> bool:
    return 41.0 <= lat <= 57.5 and -95.0 <= lng <= -74.0


async def _stay22_search(
    client: httpx.AsyncClient,
    checkin: date,
    checkout: date,
    *,
    lat: float,
    lng: float,
) -> dict[str, Any]:
    response = await client.get(
        STAY22_BASE,
        params={
            "lat": lat,
            "lng": lng,
            "radius": 3000,
            "checkin": checkin.isoformat(),
            "checkout": checkout.isoformat(),
            "adults": 2,
            "currency": "CAD",
            "pageSize": 20,
        },
        timeout=8.0,
    )
    response.raise_for_status()
    return response.json()


def _summarize_stay22(payload: dict[str, Any]) -> dict[str, Any]:
    results = payload.get("results") or []
    prices: list[float] = []
    for item in results:
        supplier_prices = [
            s["price"]["total"]
            for s in (item.get("suppliers") or {}).values()
            if isinstance(s, dict) and (s.get("price") or {}).get("total")
        ]
        if supplier_prices:
            prices.append(min(supplier_prices))
    return {
        "properties": len(results),
        "priced": len(prices),
        "median_rate": round(statistics.median(prices), 0) if prices else None,
        "min_rate": round(min(prices), 0) if prices else None,
    }


async def fetch_stay22_market(
    checkin: str | None = None,
    *,
    lat: float | None = None,
    lng: float | None = None,
) -> dict[str, Any]:
    """Shared Stay22 pull used by /stay22/market and the briefing gatherer."""
    site_lat = DEFAULT_SITE_LAT if lat is None else lat
    site_lng = DEFAULT_SITE_LNG if lng is None else lng
    cache_key = _coord_key(site_lat, site_lng)

    target_in = date.fromisoformat(checkin) if checkin else _next_saturday()
    target_out = target_in + timedelta(days=1)
    baseline_in = target_in + timedelta(days=28)
    baseline_out = baseline_in + timedelta(days=1)

    try:
        async with httpx.AsyncClient() as client:
            target_raw = await _stay22_search(
                client, target_in, target_out, lat=site_lat, lng=site_lng
            )
            baseline_raw = await _stay22_search(
                client, baseline_in, baseline_out, lat=site_lat, lng=site_lng
            )
        target = _summarize_stay22(target_raw)
        baseline = _summarize_stay22(baseline_raw)
        demand_ratio = (
            round(target["median_rate"] / baseline["median_rate"], 3)
            if target["median_rate"] and baseline["median_rate"]
            else None
        )
        result = {
            "source": "live",
            "checkin": target_in.isoformat(),
            "baseline_checkin": baseline_in.isoformat(),
            "lat": site_lat,
            "lng": site_lng,
            "target": target,
            "baseline": baseline,
            "demand_ratio": demand_ratio,
            "note": (
                f"Live Stay22 demo-mode pull, 3 km around "
                f"({site_lat:.4f}, {site_lng:.4f}). No listings are stored."
            ),
        }
        _last_stay22[cache_key] = result
        return result
    except Exception as exc:
        cached = _last_stay22.get(cache_key)
        if cached is not None:
            return {
                **cached,
                "source": "cached",
                "note": (
                    "Live pull failed; serving this session's earlier pull for "
                    "these coordinates. Disclosed as cached in the demo."
                ),
                "error": str(exc),
            }
        return {
            "source": "estimate",
            "checkin": target_in.isoformat(),
            "baseline_checkin": baseline_in.isoformat(),
            "lat": site_lat,
            "lng": site_lng,
            "target": {
                "properties": 0,
                "priced": 0,
                "median_rate": None,
                "min_rate": None,
            },
            "baseline": {
                "properties": 0,
                "priced": 0,
                "median_rate": None,
                "min_rate": None,
            },
            "demand_ratio": None,
            "note": f"Stay22 unreachable: {exc}",
            "error": str(exc),
        }


def _load_pack(name: str) -> dict[str, Any]:
    path = PACKS_DIR / name
    return json.loads(path.read_text(encoding="utf-8"))


def load_neighborhood_pack() -> dict[str, Any]:
    return _load_pack("neighborhood.json")


def load_compliance_pack() -> dict[str, Any]:
    return _load_pack("compliance.json")


async def fetch_electricity_maps(
    *,
    lat: float | None = None,
    lng: float | None = None,
) -> dict[str, Any]:
    """Optional live carbon intensity near the site (Electricity Maps)."""
    site_lat = DEFAULT_SITE_LAT if lat is None else lat
    site_lng = DEFAULT_SITE_LNG if lng is None else lng
    key = os.environ.get("ELECTRICITYMAPS_API_KEY") or ""
    default_zone = "CA-ON" if _ontario_ish(site_lat, site_lng) else "CA-ON"
    if not key:
        return {
            "source": "benchmark",
            "zone": default_zone,
            "lat": site_lat,
            "lng": site_lng,
            "carbon_intensity": None,
            "note": (
                "No ELECTRICITYMAPS_API_KEY; using TAF Ontario grid benchmarks "
                f"for coords ({site_lat:.4f}, {site_lng:.4f})."
            ),
        }
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.electricitymaps.com/v3/carbon-intensity/latest",
                params={"lat": site_lat, "lon": site_lng},
                headers={"auth-token": key},
                timeout=8.0,
            )
            if response.status_code >= 400:
                response = await client.get(
                    "https://api.electricitymaps.com/v3/carbon-intensity/latest",
                    params={"zone": default_zone},
                    headers={"auth-token": key},
                    timeout=8.0,
                )
            response.raise_for_status()
            data = response.json()
        intensity = data.get("carbonIntensity")
        zone = data.get("zone") or default_zone
        return {
            "source": "live",
            "zone": zone,
            "lat": site_lat,
            "lng": site_lng,
            "carbon_intensity": intensity,
            "datetime": data.get("datetime"),
            "note": (
                f"Live Electricity Maps carbon intensity for {zone} "
                f"resolved near ({site_lat:.4f}, {site_lng:.4f})."
            ),
            "url": "https://www.electricitymaps.com/",
        }
    except Exception as exc:
        return {
            "source": "benchmark",
            "zone": default_zone,
            "lat": site_lat,
            "lng": site_lng,
            "carbon_intensity": None,
            "note": f"Electricity Maps unreachable ({exc}); using TAF benchmarks.",
        }


def _option_snapshot(result: OptionResult) -> dict[str, Any]:
    config = result.config
    return {
        "label": config.label,
        "building_type": config.building_type,
        "rooms": config.rooms,
        "structure": config.structure,
        "hvac": config.hvac,
        "peak_kw": result.peak_kw,
        "strain_class": result.strain_class,
        "strain_ratio": result.strain_ratio,
        "tco2e_total": result.tco2e_total,
        "tco2e_operational": result.tco2e_operational,
        "tco2e_embodied_amortized": result.tco2e_embodied_amortized,
        "construction_cost": result.construction_cost,
        "annual_operating_cost": result.annual_operating_cost,
        "friction_score": friction_score(config, result),
        "friction_terms": friction_terms(config, result),
    }


def comparison_context(comparison: Comparison) -> dict[str, Any]:
    return {
        "scenario_name": comparison.scenario_name,
        "recommended": comparison.recommended,
        "capex_delta": comparison.capex_delta,
        "annual_cost_delta": comparison.annual_cost_delta,
        "tco2e_delta": comparison.tco2e_delta,
        "abatement_cost": comparison.abatement_cost,
        "abatement_threshold": comparison.abatement_threshold,
        "payback_years": comparison.payback_years,
        "reasoning": list(comparison.reasoning),
        "option_a": _option_snapshot(comparison.option_a),
        "option_b": _option_snapshot(comparison.option_b),
    }


def environment_context(
    live_grid: dict[str, Any],
    *,
    climate: dict[str, Any] | None = None,
) -> dict[str, Any]:
    peaks = (climate or {}).get("peaks_c") or {}
    heatwave_peak = peaks.get("heatwave_full", B.HEATWAVE_EVENT_PEAK_C.value)
    return {
        "heatwave_peak_c": heatwave_peak,
        "heatwave_source": (climate or {}).get("url") or B.HEATWAVE_EVENT_PEAK_C.source,
        "climate": climate,
        "grid_intensity_avg_g_per_kwh": B.GRID_INTENSITY_AVG.value,
        "grid_intensity_peak_g_per_kwh": B.GRID_INTENSITY_PEAK.value,
        "grid_avg_source": B.GRID_INTENSITY_AVG.source,
        "grid_peak_source": B.GRID_INTENSITY_PEAK.source,
        "live_grid": live_grid,
    }


def green_ratio_context(comparison: Comparison) -> dict[str, Any]:
    """Relative greenness vs a neighborhood hospitality carbon proxy."""
    avg = B.GRID_INTENSITY_AVG.value
    hotel_elec = B.HOTEL_ELEC_INTENSITY.value
    sqft_per_room = 350.0
    life = B.BUILDING_LIFE_YEARS.value
    kwh_per_room = hotel_elec * sqft_per_room
    neighborhood_proxy_tco2e_per_room_yr = round(kwh_per_room * avg / 1_000_000.0, 3)
    a = comparison.option_a
    b = comparison.option_b
    a_per_room = a.tco2e_total / max(a.config.rooms, 1)
    b_per_room = b.tco2e_total / max(b.config.rooms, 1)
    return {
        "neighborhood_proxy_tco2e_per_room_yr": neighborhood_proxy_tco2e_per_room_yr,
        "proxy_status": "estimate",
        "proxy_note": (
            "Neighborhood green ratio uses a CBECS/TAF-derived hospitality "
            "electricity proxy (~350 sqft/room), not metered nearby buildings."
        ),
        "option_a_tco2e_per_room": round(a_per_room, 3),
        "option_b_tco2e_per_room": round(b_per_room, 3),
        "option_a_vs_proxy": round(a_per_room / neighborhood_proxy_tco2e_per_room_yr, 2)
        if neighborhood_proxy_tco2e_per_room_yr
        else None,
        "option_b_vs_proxy": round(b_per_room / neighborhood_proxy_tco2e_per_room_yr, 2)
        if neighborhood_proxy_tco2e_per_room_yr
        else None,
        "building_life_years": life,
        "embodied_a": a.tco2e_embodied_amortized,
        "embodied_b": b.tco2e_embodied_amortized,
    }


async def gather_all(
    comparison: Comparison,
    *,
    lat: float | None = None,
    lng: float | None = None,
    climate: dict[str, Any] | None = None,
) -> dict[str, Any]:
    market, live_grid = await _gather_async(lat=lat, lng=lng)
    return {
        "comparison": comparison_context(comparison),
        "market": market,
        "environment": environment_context(live_grid, climate=climate),
        "neighborhood": load_neighborhood_pack(),
        "compliance": load_compliance_pack(),
        "green_ratio": green_ratio_context(comparison),
        "friction": {
            "formula": "model/friction.md",
            "label": "documented heuristic, not survey data",
            "option_a": {
                "score": friction_score(
                    comparison.option_a.config, comparison.option_a
                ),
                "terms": friction_terms(
                    comparison.option_a.config, comparison.option_a
                ),
            },
            "option_b": {
                "score": friction_score(
                    comparison.option_b.config, comparison.option_b
                ),
                "terms": friction_terms(
                    comparison.option_b.config, comparison.option_b
                ),
            },
        },
        "site": {
            "lat": DEFAULT_SITE_LAT if lat is None else lat,
            "lng": DEFAULT_SITE_LNG if lng is None else lng,
        },
    }


async def _gather_async(
    *,
    lat: float | None = None,
    lng: float | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    import asyncio

    return await asyncio.gather(
        fetch_stay22_market(lat=lat, lng=lng),
        fetch_electricity_maps(lat=lat, lng=lng),
    )
