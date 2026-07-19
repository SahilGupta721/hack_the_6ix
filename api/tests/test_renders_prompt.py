"""Streetscape prompt builder tracks assembler inputs."""

from __future__ import annotations

import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.renders import DEFAULT_PROMPTS, build_prompt


def test_default_prompt_without_overrides() -> None:
    assert build_prompt("A") == DEFAULT_PROMPTS["A"]
    assert build_prompt("B") == DEFAULT_PROMPTS["B"]


def test_prompt_includes_courtyard_and_storeys() -> None:
    text = build_prompt(
        "A",
        storeys=8,
        shape="courtyard",
        structure="concrete",
        hvac="central_gas",
        facade="curtain_wall",
        site_name="Empty site C (parking)",
        building_type="boutique",
        rooms=40,
    )
    assert "8-storey" in text
    assert "courtyard" in text.lower()
    assert "Empty site C" in text
    assert "curtain-wall" in text.lower() or "curtain wall" in text.lower()
    assert "central-plant" in text.lower() or "central plant" in text.lower()


def test_option_b_timber_heat_pump() -> None:
    text = build_prompt(
        "B",
        storeys=6,
        shape="podium_tower",
        structure="mass_timber",
        hvac="heat_pump",
        facade="rainscreen",
        site_name="Harbourfront",
    )
    assert "6-storey" in text
    assert "mass-timber" in text.lower() or "mass timber" in text.lower()
    assert "heat-pump" in text.lower() or "heat pump" in text.lower()
    assert "podium" in text.lower()
