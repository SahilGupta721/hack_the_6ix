"""Rules & Compliance Engine: deterministic massing vs pack clauses."""

from __future__ import annotations

import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.agents.compliance_engine import run_compliance_checks
from app.agents.gather import load_compliance_pack
from app.agents.llm import DeterministicFallbackProvider
from app.agents.specialists.compliance import analyze_compliance


def _base_ctx(**overrides):
    pack = load_compliance_pack()
    ctx = {
        "compliance": pack,
        "comparison": {
            "option_a": {
                "building_type": "boutique",
                "rooms": 40,
                "structure": "concrete",
                "hvac": "central_gas",
            },
            "option_b": {
                "building_type": "boutique",
                "rooms": 40,
                "structure": "mass_timber",
                "hvac": "heat_pump",
            },
        },
        "massing": {
            "shape": "slab",
            "storeys": 8,
            "rooms": 40,
        },
        "site": {"lat": 43.6476, "lng": -79.3744, "acres": 0.35},
    }
    ctx.update(overrides)
    return ctx


def test_compliance_pack_has_overlays() -> None:
    pack = load_compliance_pack()
    assert pack.get("jurisdiction")
    overlays = pack.get("site_overlays") or {}
    assert overlays.get("max_height_m")
    assert "front_setback_m" in overlays
    assert "angular_plane_deg" in overlays


def test_engine_side_by_side_rows() -> None:
    report = run_compliance_checks(_base_ctx())
    assert report["gate"] is False
    checks = report["checks"]
    assert len(checks) >= 5
    ids = {c["id"] for c in checks}
    assert "height_limit" in ids
    assert "zoning_district" in ids
    height = next(c for c in checks if c["id"] == "height_limit")
    assert height["model"] == 28.0  # 8 × 3.5
    assert height["status"] in ("pass", "warn", "fail")
    assert "clause" in height and height["clause"]
    assert "model_display" in height and "limit_display" in height
    assert report["tallies"]["pass"] + report["tallies"]["warn"] + report[
        "tallies"
    ]["fail"] + report["tallies"]["info"] == len(checks)


def test_height_over_limit_fails() -> None:
    report = run_compliance_checks(
        _base_ctx(massing={"shape": "slab", "storeys": 20, "rooms": 40})
    )
    height = next(c for c in report["checks"] if c["id"] == "height_limit")
    assert height["status"] == "fail"
    assert height["delta"] is not None and height["delta"] > 0


def test_emtc_check_for_option_b() -> None:
    report = run_compliance_checks(_base_ctx())
    emtc = [c for c in report["checks"] if str(c["id"]).startswith("emtc")]
    assert emtc
    assert any(c.get("applies_to") == "B" for c in emtc)


def test_specialist_keeps_checks_in_metrics() -> None:
    brief = analyze_compliance(DeterministicFallbackProvider(), _base_ctx())
    assert brief.agent_id == "compliance"
    assert brief.title == "Rules & compliance"
    checks = brief.metrics.get("checks") or []
    assert len(checks) >= 5
    assert brief.metrics.get("gate") is False
    assert "tallies" in brief.metrics
