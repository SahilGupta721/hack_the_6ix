"""Location-aware climate scenarios from Open-Meteo archive.

Builds five named 48h StressScenario temp curves from local extremes.
Falls back to Toronto benchmark SCENARIOS when the archive is unreachable.
Not a full 8760h weather year — extreme weekends only.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import httpx
from innsight_model.sim import SCENARIOS, StressScenario

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
ARCHIVE_SOURCE_URL = "https://open-meteo.com/en/docs/historical-weather-api"

# Prefer a complete prior calendar year (stable archive coverage).
_ARCHIVE_YEAR = 2024

_SCENARIO_META: dict[str, dict[str, Any]] = {
    "heatwave_full": {
        "name": "Heat-Wave Weekend + Full Occupancy",
        "occupancy": 1.0,
    },
    "summer_shoulder": {
        "name": "Summer Shoulder Weekend (~local warm)",
        "occupancy": 0.85,
    },
    "typical_weekend": {
        "name": "Typical Mild Summer Weekend",
        "occupancy": 0.65,
    },
    "winter_typical": {
        "name": "Typical Winter Weekend",
        "occupancy": 0.70,
    },
    "deep_cold_full": {
        "name": "Deep-Cold Weekend + Full Occupancy",
        "occupancy": 1.0,
    },
}


def _benchmark_scenarios() -> dict[str, StressScenario]:
    return {k: SCENARIOS[k] for k in _SCENARIO_META if k in SCENARIOS}


def _benchmark_meta(*, reason: str) -> dict[str, Any]:
    return {
        "source": "benchmark",
        "provider": "toronto_fixed_curves",
        "note": (
            f"{reason} Using documented Toronto extreme-weekend curves "
            "(not location-specific). Not a full 8760h year."
        ),
        "url": None,
        "archive_year": None,
        "lat": None,
        "lng": None,
        "peaks_c": {
            k: round(max(SCENARIOS[k].hourly_temps_c), 1)
            for k in _SCENARIO_META
            if k in SCENARIOS
        },
    }


def _window_score_max(temps: list[float], start: int) -> float:
    return max(temps[start : start + 48])


def _window_score_min(temps: list[float], start: int) -> float:
    return min(temps[start : start + 48])


def _pick_window(
    temps: list[float],
    *,
    mode: str,
    month_filter: set[int] | None,
    times: list[str],
) -> tuple[int, tuple[float, ...]]:
    """Pick a 48h start index. mode: hottest | coldest | median_max."""
    candidates: list[tuple[float, int]] = []
    n = len(temps)
    for start in range(0, n - 47, 24):  # day-aligned windows
        if month_filter is not None:
            # times[i] like 2024-07-14T00:00
            month = int(times[start][5:7])
            if month not in month_filter:
                continue
        if mode == "hottest":
            score = _window_score_max(temps, start)
        elif mode == "coldest":
            score = _window_score_min(temps, start)
        else:  # median ranking by max
            score = _window_score_max(temps, start)
        candidates.append((score, start))

    if not candidates:
        # Fall back to full series if month filter emptied the set.
        return _pick_window(temps, mode=mode, month_filter=None, times=times)

    if mode == "hottest":
        start = max(candidates, key=lambda x: x[0])[1]
    elif mode == "coldest":
        start = min(candidates, key=lambda x: x[0])[1]
    else:
        candidates.sort(key=lambda x: x[0])
        start = candidates[len(candidates) // 2][1]

    chunk = tuple(round(t, 2) for t in temps[start : start + 48])
    return start, chunk


def _scenarios_from_hourly(
    temps: list[float], times: list[str]
) -> dict[str, StressScenario]:
    # Summer months Jun-Aug; winter Dec-Feb
    summer = {6, 7, 8}
    winter = {12, 1, 2}

    _, heat = _pick_window(temps, mode="hottest", month_filter=summer, times=times)
    # Shoulder: warm summer but not the absolute hottest — use 85th percentile window.
    summer_cands: list[tuple[float, int]] = []
    for start in range(0, len(temps) - 47, 24):
        month = int(times[start][5:7])
        if month not in summer:
            continue
        summer_cands.append((_window_score_max(temps, start), start))
    summer_cands.sort(key=lambda x: x[0])
    if summer_cands:
        idx = min(len(summer_cands) - 1, int(len(summer_cands) * 0.85))
        shoulder_start = summer_cands[idx][1]
        # Avoid identical window to heatwave when possible.
        heat_max = max(heat)
        if abs(summer_cands[idx][0] - heat_max) < 0.05 and idx > 0:
            shoulder_start = summer_cands[max(0, idx - 1)][1]
        shoulder = tuple(
            round(t, 2) for t in temps[shoulder_start : shoulder_start + 48]
        )
    else:
        _, shoulder = _pick_window(
            temps, mode="median_max", month_filter=summer, times=times
        )

    _, typical = _pick_window(
        temps, mode="median_max", month_filter=summer, times=times
    )
    _, winter_typ = _pick_window(
        temps, mode="median_max", month_filter=winter, times=times
    )
    _, deep = _pick_window(temps, mode="coldest", month_filter=winter, times=times)

    curves = {
        "heatwave_full": heat,
        "summer_shoulder": shoulder,
        "typical_weekend": typical,
        "winter_typical": winter_typ,
        "deep_cold_full": deep,
    }
    out: dict[str, StressScenario] = {}
    for key, hourly in curves.items():
        meta = _SCENARIO_META[key]
        out[key] = StressScenario(
            name=meta["name"],
            occupancy=meta["occupancy"],
            hourly_temps_c=hourly,
        )
    return out


async def fetch_location_scenarios(
    lat: float,
    lng: float,
) -> tuple[dict[str, StressScenario], dict[str, Any]]:
    """Return (scenarios_by_key, climate_meta). Always returns usable scenarios."""
    start = date(_ARCHIVE_YEAR, 1, 1)
    end = date(_ARCHIVE_YEAR, 12, 31)
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                ARCHIVE_URL,
                params={
                    "latitude": lat,
                    "longitude": lng,
                    "start_date": start.isoformat(),
                    "end_date": end.isoformat(),
                    "hourly": "temperature_2m",
                    "timezone": "auto",
                },
                timeout=20.0,
            )
            response.raise_for_status()
            data = response.json()
        hourly = data.get("hourly") or {}
        temps = hourly.get("temperature_2m") or []
        times = hourly.get("time") or []
        if len(temps) < 48 * 7 or len(temps) != len(times):
            return _benchmark_scenarios(), _benchmark_meta(
                reason="Open-Meteo returned insufficient hourly data."
            )
        # Drop nulls by forward-fill lightly
        cleaned: list[float] = []
        last = 10.0
        for t in temps:
            if t is None:
                cleaned.append(last)
            else:
                last = float(t)
                cleaned.append(last)
        scenarios = _scenarios_from_hourly(cleaned, times)
        meta = {
            "source": "live",
            "provider": "open-meteo-archive",
            "note": (
                f"Local extreme 48h weekends derived from Open-Meteo archive "
                f"{_ARCHIVE_YEAR} at ({lat:.4f}, {lng:.4f}). Not a full 8760h "
                "weather simulation; annual energy stays CBECS averages."
            ),
            "url": ARCHIVE_SOURCE_URL,
            "archive_year": _ARCHIVE_YEAR,
            "lat": lat,
            "lng": lng,
            "peaks_c": {
                k: round(max(s.hourly_temps_c), 1) for k, s in scenarios.items()
            },
        }
        return scenarios, meta
    except Exception as exc:
        return _benchmark_scenarios(), _benchmark_meta(
            reason=f"Open-Meteo unreachable ({exc})."
        )


def climate_age_note() -> str:
    """Used when archive year is intentionally lagged for coverage."""
    today = date.today()
    lag = today.year - _ARCHIVE_YEAR
    if lag <= 1:
        return f"Archive year {_ARCHIVE_YEAR}."
    return f"Archive year {_ARCHIVE_YEAR} ({lag} years behind wall clock)."
