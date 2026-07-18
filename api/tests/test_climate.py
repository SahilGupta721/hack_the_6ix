"""Open-Meteo climate scenario builder: fallback and synthetic archive."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.agents.climate import _scenarios_from_hourly, fetch_location_scenarios
from innsight_model.sim import SCENARIOS


def test_open_meteo_failure_falls_back_to_toronto_benchmarks() -> None:
    async def _run():
        with patch("app.agents.climate.httpx.AsyncClient") as client_cls:
            client = MagicMock()
            client.__aenter__ = AsyncMock(return_value=client)
            client.__aexit__ = AsyncMock(return_value=None)
            client.get = AsyncMock(side_effect=RuntimeError("network down"))
            client_cls.return_value = client
            return await fetch_location_scenarios(43.65, -79.38)

    scenarios, meta = asyncio.run(_run())
    assert meta["source"] == "benchmark"
    assert set(scenarios.keys()) == set(SCENARIOS.keys())
    assert max(scenarios["heatwave_full"].hourly_temps_c) == max(
        SCENARIOS["heatwave_full"].hourly_temps_c
    )


def test_synthetic_hourly_builds_five_named_scenarios() -> None:
    # 366 days × 24h of synthetic temps: hot in July, cold in January.
    times: list[str] = []
    temps: list[float] = []
    for month in range(1, 13):
        days = 31 if month in (1, 3, 5, 7, 8, 10, 12) else 30
        if month == 2:
            days = 29  # 2024 leap
        for day in range(1, days + 1):
            for hour in range(24):
                times.append(f"2024-{month:02d}-{day:02d}T{hour:02d}:00")
                if month in (6, 7, 8):
                    base = 28.0 + (5.0 if month == 7 and day == 15 else 0.0)
                    temps.append(base + (4 if 12 <= hour <= 16 else 0))
                elif month in (12, 1, 2):
                    base = -8.0 - (10.0 if month == 1 and day == 20 else 0.0)
                    temps.append(base - (3 if hour < 6 else 0))
                else:
                    temps.append(10.0)

    scenarios = _scenarios_from_hourly(temps, times)
    assert set(scenarios.keys()) == {
        "heatwave_full",
        "summer_shoulder",
        "typical_weekend",
        "winter_typical",
        "deep_cold_full",
    }
    assert len(scenarios["heatwave_full"].hourly_temps_c) == 48
    assert max(scenarios["heatwave_full"].hourly_temps_c) >= max(
        scenarios["summer_shoulder"].hourly_temps_c
    )
    assert min(scenarios["deep_cold_full"].hourly_temps_c) <= min(
        scenarios["winter_typical"].hourly_temps_c
    )
