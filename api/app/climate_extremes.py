"""Location extreme weekends from Open-Meteo ERA5 historical archive.

Builds the same five year-pack scenario keys as innsight_model.sim.SCENARIOS,
but with outdoor dry-bulb extremes derived from the searched lat/lng.
Falls back to the curated Toronto pack if the archive is unreachable.
"""

from __future__ import annotations

import time
from datetime import date, timedelta
from typing import Any

import httpx

from innsight_model.sim import SCENARIOS, StressScenario, make_stress_scenario

ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
USER_AGENT = "INNSIGHT/0.1 (Hack the 6ix; ERA5 stress climates)"

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL_S = 6 * 3600.0
_CACHE_MAX = 40

# Occupancy matches curated SCENARIOS.
_OCC = {
    "heatwave_full": 1.0,
    "summer_shoulder": 0.85,
    "typical_weekend": 0.65,
    "winter_typical": 0.70,
    "deep_cold_full": 1.0,
}


def _cache_key(lat: float, lng: float) -> str:
    return f"{round(lat, 2)},{round(lng, 2)}"


def _cache_get(key: str) -> dict[str, Any] | None:
    hit = _CACHE.get(key)
    if not hit:
        return None
    expires, value = hit
    if time.time() > expires:
        _CACHE.pop(key, None)
        return None
    return value


def _cache_set(key: str, value: dict[str, Any]) -> None:
    if len(_CACHE) >= _CACHE_MAX:
        for k, _ in sorted(_CACHE.items(), key=lambda kv: kv[1][0])[:10]:
            _CACHE.pop(k, None)
    _CACHE[key] = (time.time() + _CACHE_TTL_S, value)


def _pair_days(
    dates: list[str],
    tmax: list[float],
    tmin: list[float],
    idx: int,
) -> tuple[tuple[float, float], tuple[float, float], list[str]]:
    """Two consecutive days centered on idx (prefer idx, idx+1)."""
    if idx >= len(dates) - 1:
        idx = max(0, len(dates) - 2)
    i0, i1 = idx, idx + 1
    day1 = (float(tmin[i0]), float(tmax[i0]))
    day2 = (float(tmin[i1]), float(tmax[i1]))
    return day1, day2, [dates[i0], dates[i1]]


def _pick_index(values: list[float], target: float) -> int:
    """Index of value closest to target."""
    best_i = 0
    best_d = abs(values[0] - target)
    for i, v in enumerate(values):
        d = abs(v - target)
        if d < best_d:
            best_d = d
            best_i = i
    return best_i


def _build_from_daily(
    dates: list[str],
    tmax: list[float],
    tmin: list[float],
    lat: float,
    lng: float,
    start: str,
    end: str,
) -> dict[str, Any]:
    summer_idx = [
        i
        for i, d in enumerate(dates)
        if d[5:7] in ("06", "07", "08") and i < len(dates) - 1
    ]
    winter_idx = [
        i
        for i, d in enumerate(dates)
        if d[5:7] in ("12", "01", "02") and i < len(dates) - 1
    ]
    if not summer_idx or not winter_idx:
        raise ValueError("insufficient seasonal coverage in archive response")

    summer_tmax = [tmax[i] for i in summer_idx]
    winter_tmin = [tmin[i] for i in winter_idx]

    heat_i = summer_idx[max(range(len(summer_tmax)), key=lambda j: summer_tmax[j])]
    cold_i = winter_idx[min(range(len(winter_tmin)), key=lambda j: winter_tmin[j])]

    sorted_summer = sorted(summer_tmax)
    p85 = sorted_summer[int(0.85 * (len(sorted_summer) - 1))]
    median_summer = sorted_summer[len(sorted_summer) // 2]
    shoulder_i = summer_idx[_pick_index(summer_tmax, p85)]
    # Avoid duplicating the absolute hottest day for shoulder when possible.
    if shoulder_i == heat_i and len(summer_idx) > 1:
        candidates = [i for i in summer_idx if i != heat_i]
        shoulder_i = min(candidates, key=lambda i: abs(tmax[i] - p85))

    typical_i = summer_idx[_pick_index(summer_tmax, median_summer)]

    sorted_winter = sorted(winter_tmin)
    median_winter = sorted_winter[len(sorted_winter) // 2]
    winter_typ_i = winter_idx[_pick_index(winter_tmin, median_winter)]

    picks: dict[str, Any] = {}
    scenarios: dict[str, StressScenario] = {}

    def add(
        key: str,
        idx: int,
        label: str,
    ) -> None:
        day1, day2, pair_dates = _pair_days(dates, tmax, tmin, idx)
        peak = max(day1[1], day2[1])
        floor = min(day1[0], day2[0])
        scenarios[key] = make_stress_scenario(
            f"{label} ({peak:.1f}/{floor:.1f} C ERA5)",
            _OCC[key],
            day1,
            day2,
        )
        picks[key] = {
            "dates": pair_dates,
            "day1_tmin_tmax_c": [round(day1[0], 1), round(day1[1], 1)],
            "day2_tmin_tmax_c": [round(day2[0], 1), round(day2[1], 1)],
            "peak_c": round(peak, 1),
            "floor_c": round(floor, 1),
        }

    add("heatwave_full", heat_i, "Heat-Wave Weekend + Full Occupancy")
    add("summer_shoulder", shoulder_i, "Summer Shoulder Weekend")
    add("typical_weekend", typical_i, "Typical Summer Weekend")
    add("winter_typical", winter_typ_i, "Typical Winter Weekend")
    add("deep_cold_full", cold_i, "Deep-Cold Weekend + Full Occupancy")

    return {
        "scenarios": scenarios,
        "meta": {
            "source": "Open-Meteo Historical Weather (ERA5)",
            "url": "https://open-meteo.com/en/docs/historical-weather-api",
            "lat": lat,
            "lng": lng,
            "archive_start": start,
            "archive_end": end,
            "fallback": False,
            "picks": picks,
            "heatwave_peak_c": picks["heatwave_full"]["peak_c"],
            "deep_cold_floor_c": picks["deep_cold_full"]["floor_c"],
        },
    }


async def fetch_location_year_scenarios(
    lat: float,
    lng: float,
) -> dict[str, Any]:
    """Return {scenarios, meta}. On failure, curated Toronto SCENARIOS + fallback meta."""
    key = _cache_key(lat, lng)
    cached = _cache_get(key)
    if cached is not None:
        return cached

    end = date.today() - timedelta(days=8)
    start = date(end.year - 2, 1, 1)
    params = {
        "latitude": lat,
        "longitude": lng,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "daily": "temperature_2m_max,temperature_2m_min",
        "timezone": "auto",
    }

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            res = await client.get(
                ARCHIVE,
                params=params,
                headers={"User-Agent": USER_AGENT},
            )
        if res.status_code != 200:
            raise RuntimeError(f"archive status {res.status_code}")
        daily = (res.json() or {}).get("daily") or {}
        dates = daily.get("time") or []
        tmax = daily.get("temperature_2m_max") or []
        tmin = daily.get("temperature_2m_min") or []
        if not dates or len(dates) != len(tmax) or len(dates) != len(tmin):
            raise RuntimeError("malformed archive daily series")
        # Drop nulls by skipping incomplete days
        clean_dates: list[str] = []
        clean_tmax: list[float] = []
        clean_tmin: list[float] = []
        for d, hi, lo in zip(dates, tmax, tmin):
            if hi is None or lo is None:
                continue
            clean_dates.append(d)
            clean_tmax.append(float(hi))
            clean_tmin.append(float(lo))
        if len(clean_dates) < 60:
            raise RuntimeError("too few valid daily points")
        payload = _build_from_daily(
            clean_dates,
            clean_tmax,
            clean_tmin,
            lat,
            lng,
            start.isoformat(),
            end.isoformat(),
        )
        _cache_set(key, payload)
        return payload
    except Exception as exc:  # noqa: BLE001 — fallback is intentional for demo resilience
        return {
            "scenarios": dict(SCENARIOS),
            "meta": {
                "source": "Curated Toronto demo pack (archive unavailable)",
                "url": None,
                "lat": lat,
                "lng": lng,
                "fallback": True,
                "error": str(exc),
                "heatwave_peak_c": max(SCENARIOS["heatwave_full"].hourly_temps_c),
                "deep_cold_floor_c": min(SCENARIOS["deep_cold_full"].hourly_temps_c),
            },
        }
