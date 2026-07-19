"""Past-run list serialization (no Mongo required)."""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.storage import _list_item


def test_list_item_marks_report_presence() -> None:
    ts = datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc)
    with_report = _list_item(
        {
            "_id": "abc",
            "ts": ts,
            "scenario": "Year pack (5 extreme weekends)",
            "building_type": "boutique",
            "rooms": 80,
            "recommended": "B",
            "kind": "year_pack",
            "report": {"kind": "year_pack", "memo": {}},
            "flip_scenarios": [],
        }
    )
    assert with_report["has_report"] is True
    assert with_report["kind"] == "year_pack"
    assert with_report["id"] == "abc"

    without = _list_item(
        {
            "_id": "def",
            "ts": ts,
            "scenario": "heatwave_full",
            "building_type": "boutique",
            "rooms": 80,
            "recommended": "B",
            "kind": "year_pack",
        }
    )
    assert without["has_report"] is False
