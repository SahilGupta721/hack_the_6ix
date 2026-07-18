"""Briefing orchestrator: deterministic fallback path (no Gemini / no Stay22)."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.agents.llm import DeterministicFallbackProvider
from app.agents.orchestrator import ALL_AGENT_IDS, run_briefing, run_year_briefing
from innsight_model.sim import SCENARIOS


@pytest.fixture
def anyio_backend():
    return "asyncio"


def test_fallback_briefing_has_all_specialists_and_boss() -> None:
    market_stub = {
        "source": "estimate",
        "checkin": "2026-07-25",
        "baseline_checkin": "2026-08-22",
        "target": {
            "properties": 12,
            "priced": 8,
            "median_rate": 240.0,
            "min_rate": 180.0,
        },
        "baseline": {
            "properties": 12,
            "priced": 8,
            "median_rate": 200.0,
            "min_rate": 160.0,
        },
        "demand_ratio": 1.2,
        "note": "stub",
    }
    grid_stub = {
        "source": "benchmark",
        "zone": "CA-ON",
        "carbon_intensity": None,
        "note": "stub",
    }

    async def _run():
        with (
            patch(
                "app.agents.gather.fetch_stay22_market",
                new=AsyncMock(return_value=market_stub),
            ),
            patch(
                "app.agents.gather.fetch_electricity_maps",
                new=AsyncMock(return_value=grid_stub),
            ),
            patch(
                "app.agents.orchestrator.fetch_location_year_scenarios",
                new=AsyncMock(
                    return_value={
                        "scenarios": dict(SCENARIOS),
                        "meta": {
                            "source": "Curated Toronto demo pack (test)",
                            "fallback": True,
                            "heatwave_peak_c": 36.2,
                            "deep_cold_floor_c": -22.0,
                        },
                    }
                ),
            ),
        ):
            return await run_briefing(
                building_type="boutique",
                rooms=40,
                scenario="heatwave_full",
                provider=DeterministicFallbackProvider(),
            )

    result = asyncio.run(_run())

    assert result.generator == "deterministic-fallback"
    assert set(result.briefs.keys()) == set(ALL_AGENT_IDS)
    for agent_id in ALL_AGENT_IDS:
        brief = result.briefs[agent_id]
        assert brief.agent_id == agent_id
        assert brief.findings
        assert 0.0 <= brief.confidence <= 1.0
        assert brief.sources
    assert result.synthesis.summary
    assert result.synthesis.environmental_impact
    assert result.synthesis.business_impact
    assert result.comparison["recommended"] in ("A", "B")
    assert "option_a" in result.comparison
    assert "option_b" in result.comparison


def test_include_agents_subset() -> None:
    market_stub = {
        "source": "estimate",
        "checkin": "2026-07-25",
        "baseline_checkin": "2026-08-22",
        "target": {"properties": 0, "priced": 0, "median_rate": None, "min_rate": None},
        "baseline": {"properties": 0, "priced": 0, "median_rate": None, "min_rate": None},
        "demand_ratio": None,
        "note": "stub",
    }
    grid_stub = {
        "source": "benchmark",
        "zone": "CA-ON",
        "carbon_intensity": None,
        "note": "stub",
    }

    async def _run():
        with (
            patch(
                "app.agents.gather.fetch_stay22_market",
                new=AsyncMock(return_value=market_stub),
            ),
            patch(
                "app.agents.gather.fetch_electricity_maps",
                new=AsyncMock(return_value=grid_stub),
            ),
            patch(
                "app.agents.orchestrator.fetch_location_year_scenarios",
                new=AsyncMock(
                    return_value={
                        "scenarios": dict(SCENARIOS),
                        "meta": {
                            "source": "Curated Toronto demo pack (test)",
                            "fallback": True,
                            "heatwave_peak_c": 36.2,
                            "deep_cold_floor_c": -22.0,
                        },
                    }
                ),
            ),
        ):
            return await run_briefing(
                building_type="homestay",
                rooms=6,
                include_agents=["market", "friction"],
                provider=DeterministicFallbackProvider(),
            )

    result = asyncio.run(_run())
    assert set(result.briefs.keys()) == {"market", "friction"}
    assert result.synthesis.summary


def test_year_pack_fallback() -> None:
    market_stub = {
        "source": "estimate",
        "checkin": "2026-07-25",
        "baseline_checkin": "2026-08-22",
        "target": {
            "properties": 12,
            "priced": 8,
            "median_rate": 240.0,
            "min_rate": 180.0,
        },
        "baseline": {
            "properties": 12,
            "priced": 8,
            "median_rate": 200.0,
            "min_rate": 160.0,
        },
        "demand_ratio": 1.2,
        "note": "stub",
    }
    grid_stub = {
        "source": "benchmark",
        "zone": "CA-ON",
        "carbon_intensity": None,
        "note": "stub",
    }

    async def _run():
        climate_meta = {
            "source": "Curated Toronto demo pack (test)",
            "fallback": True,
            "heatwave_peak_c": 36.2,
            "deep_cold_floor_c": -22.0,
            "lat": 43.65,
            "lng": -79.38,
        }
        with (
            patch(
                "app.agents.gather.fetch_stay22_market",
                new=AsyncMock(return_value=market_stub),
            ),
            patch(
                "app.agents.gather.fetch_electricity_maps",
                new=AsyncMock(return_value=grid_stub),
            ),
            patch(
                "app.agents.orchestrator.fetch_location_year_scenarios",
                new=AsyncMock(
                    return_value={
                        "scenarios": dict(SCENARIOS),
                        "meta": climate_meta,
                    }
                ),
            ),
        ):
            return await run_year_briefing(
                building_type="boutique",
                rooms=40,
                provider=DeterministicFallbackProvider(),
                lat=43.65,
                lng=-79.38,
                site_name="Test Site",
            )

    result = asyncio.run(_run())

    assert result.generator == "deterministic-fallback"
    assert result.climate is not None
    assert result.climate["source"] == "benchmark"
    assert set(result.scenarios.keys()) == {
        "heatwave_full",
        "summer_shoulder",
        "typical_weekend",
        "winter_typical",
        "deep_cold_full",
    }
    assert set(result.briefs.keys()) == set(ALL_AGENT_IDS)
    assert result.synthesis.summary
    assert result.matrix_summary["baseline_scenario"] == "heatwave_full"
    assert "recommended_by_scenario" in result.matrix_summary
    assert result.memo.get("kind") == "year_pack"
    assert result.memo.get("portfolio_table")
    assert len(result.memo["portfolio_table"]) == 5
    assert result.memo["portfolio_table"][0].get("hourly_kw_a")
    assert result.memo["portfolio_table"][0].get("hourly_kw_b")
    assert "environmental_summary" in result.memo
    assert result.memo["environmental_summary"].get("climate")
    assert "narrative" in result.memo
    assert result.comparison["recommended"] in ("A", "B")

    # Cold scenario: HP Option B peak still exceeds gas Option A inside matrix.
    cold = result.scenarios["deep_cold_full"]
    assert cold["option_b"]["peak_kw"] > cold["option_a"]["peak_kw"]
