"""MongoDB Atlas persistence for memo / briefing runs.

Stores run metadata plus a reopenable `report` blob (memo / briefs / matrix)
so Past runs can restore the stress + memo UI. Never stores Stay22 listing
data. Degrades to a no-op when MONGODB_URI is absent so the core loop never
depends on the database. The summary endpoint is an aggregation pipeline, per
the Atlas track's preference for Atlas-native features.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Query

from app.mongo import collection

router = APIRouter()

HONESTY_NOTE = (
    "sim deterministic; LLM narrative over computed figures; "
    "no Stay22 listings stored"
)


def _runs_collection() -> Any | None:
    return collection("memo_runs")


def _list_item(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(doc.get("_id")),
        "ts": doc.get("ts").isoformat()
        if hasattr(doc.get("ts"), "isoformat")
        else doc.get("ts"),
        "scenario": doc.get("scenario"),
        "building_type": doc.get("building_type"),
        "rooms": doc.get("rooms"),
        "structure_a": doc.get("structure_a"),
        "hvac_a": doc.get("hvac_a"),
        "structure_b": doc.get("structure_b"),
        "hvac_b": doc.get("hvac_b"),
        "recommended": doc.get("recommended"),
        "abatement_cost": doc.get("abatement_cost"),
        "tco2e_delta": doc.get("tco2e_delta"),
        "capex_delta": doc.get("capex_delta"),
        "narrative_generator": doc.get("narrative_generator"),
        "fallback_reason": doc.get("fallback_reason"),
        "briefing_generator": doc.get("briefing_generator"),
        "briefing_fallback_reason": doc.get("briefing_fallback_reason"),
        "agent_source_statuses": doc.get("agent_source_statuses") or [],
        "honesty_note": doc.get("honesty_note") or HONESTY_NOTE,
        "kind": doc.get("kind") or "memo",
        "has_report": isinstance(doc.get("report"), dict) and bool(doc.get("report")),
        "flip_scenarios": doc.get("flip_scenarios") or [],
        "worst_peak_scenario": doc.get("worst_peak_scenario"),
    }


def record_run(
    memo: dict[str, Any],
    *,
    auth0_sub: str | None = None,
    briefing_generator: str | None = None,
    briefing_fallback_reason: str | None = None,
    agent_source_statuses: list[str] | None = None,
    structure_a: str | None = None,
    hvac_a: str | None = None,
    structure_b: str | None = None,
    hvac_b: str | None = None,
    report: dict[str, Any] | None = None,
) -> None:
    coll = _runs_collection()
    if coll is None:
        return
    try:
        options = memo["options"]
        doc: dict[str, Any] = {
            "ts": datetime.now(timezone.utc),
            "scenario": memo["scenario"],
            "building_type": options[0]["building_type"],
            "rooms": options[0]["rooms"],
            "structure_a": structure_a or options[0].get("structure"),
            "hvac_a": hvac_a or options[0].get("hvac"),
            "structure_b": structure_b
            or (options[1].get("structure") if len(options) > 1 else None),
            "hvac_b": hvac_b
            or (options[1].get("hvac") if len(options) > 1 else None),
            "recommended": memo["comparison"]["recommended"],
            "abatement_cost": memo["comparison"]["abatement_cost"],
            "tco2e_delta": memo["comparison"]["tco2e_delta"],
            "capex_delta": memo["comparison"]["capex_delta"],
            "narrative_generator": memo.get("narrative", {}).get("generator"),
            "fallback_reason": memo.get("narrative", {}).get("fallback_reason"),
            "briefing_generator": briefing_generator,
            "briefing_fallback_reason": briefing_fallback_reason,
            "agent_source_statuses": agent_source_statuses or [],
            "honesty_note": HONESTY_NOTE,
            "kind": "memo",
        }
        if report:
            doc["report"] = report
        if auth0_sub:
            doc["auth0_sub"] = auth0_sub
        coll.insert_one(doc)
    except Exception:
        pass  # persistence must never break the demo path


def record_briefing_run(
    *,
    comparison: dict[str, Any],
    generator: str,
    fallback_reason: str | None,
    briefs: dict[str, Any],
    auth0_sub: str | None = None,
    report: dict[str, Any] | None = None,
) -> None:
    """Persist a briefing-only summary when memo is not yet available."""
    coll = _runs_collection()
    if coll is None:
        return
    try:
        option_a = comparison.get("option_a") or {}
        option_b = comparison.get("option_b") or {}
        cfg_a = option_a.get("config") or {}
        cfg_b = option_b.get("config") or {}
        statuses: list[str] = []
        for brief in briefs.values():
            sources = brief.get("sources") if isinstance(brief, dict) else []
            for src in sources or []:
                status = src.get("status") if isinstance(src, dict) else None
                if status:
                    statuses.append(str(status))
        doc: dict[str, Any] = {
            "ts": datetime.now(timezone.utc),
            "scenario": comparison.get("scenario_name"),
            "building_type": cfg_a.get("building_type"),
            "rooms": cfg_a.get("rooms"),
            "structure_a": cfg_a.get("structure"),
            "hvac_a": cfg_a.get("hvac"),
            "structure_b": cfg_b.get("structure"),
            "hvac_b": cfg_b.get("hvac"),
            "recommended": comparison.get("recommended"),
            "abatement_cost": comparison.get("abatement_cost"),
            "tco2e_delta": comparison.get("tco2e_delta"),
            "capex_delta": comparison.get("capex_delta"),
            "briefing_generator": generator,
            "briefing_fallback_reason": fallback_reason,
            "agent_source_statuses": sorted(set(statuses)),
            "honesty_note": HONESTY_NOTE,
            "kind": "briefing",
        }
        if report:
            doc["report"] = report
        if auth0_sub:
            doc["auth0_sub"] = auth0_sub
        coll.insert_one(doc)
    except Exception:
        pass


def record_year_pack_run(
    *,
    memo: dict[str, Any],
    matrix_summary: dict[str, Any],
    generator: str,
    fallback_reason: str | None,
    briefs: dict[str, Any],
    auth0_sub: str | None = None,
    structure_a: str | None = None,
    hvac_a: str | None = None,
    structure_b: str | None = None,
    hvac_b: str | None = None,
    report: dict[str, Any] | None = None,
) -> None:
    """Persist year-pack summary + reopenable report (kind=year_pack)."""
    coll = _runs_collection()
    if coll is None:
        return
    try:
        options = memo.get("options") or []
        statuses: list[str] = []
        for brief in briefs.values():
            sources = brief.get("sources") if isinstance(brief, dict) else []
            for src in sources or []:
                status = src.get("status") if isinstance(src, dict) else None
                if status:
                    statuses.append(str(status))
        comparison = memo.get("comparison") or {}
        doc: dict[str, Any] = {
            "ts": datetime.now(timezone.utc),
            "scenario": memo.get("scenario") or "Year pack (5 extreme weekends)",
            "building_type": options[0].get("building_type") if options else None,
            "rooms": options[0].get("rooms") if options else None,
            "structure_a": structure_a
            or (options[0].get("structure") if options else None),
            "hvac_a": hvac_a or (options[0].get("hvac") if options else None),
            "structure_b": structure_b
            or (options[1].get("structure") if len(options) > 1 else None),
            "hvac_b": hvac_b
            or (options[1].get("hvac") if len(options) > 1 else None),
            "recommended": comparison.get("recommended")
            or matrix_summary.get("baseline_recommended"),
            "abatement_cost": comparison.get("abatement_cost"),
            "tco2e_delta": comparison.get("tco2e_delta"),
            "capex_delta": comparison.get("capex_delta"),
            "narrative_generator": (memo.get("narrative") or {}).get("generator"),
            "fallback_reason": (memo.get("narrative") or {}).get("fallback_reason")
            or fallback_reason,
            "briefing_generator": generator,
            "briefing_fallback_reason": fallback_reason,
            "agent_source_statuses": sorted(set(statuses)),
            "honesty_note": HONESTY_NOTE,
            "kind": "year_pack",
            "flip_scenarios": matrix_summary.get("flip_scenarios") or [],
            "worst_peak_scenario": matrix_summary.get("worst_peak_scenario"),
        }
        if report:
            doc["report"] = report
        if auth0_sub:
            doc["auth0_sub"] = auth0_sub
        coll.insert_one(doc)
    except Exception:
        pass


@router.get("/runs/summary")
def runs_summary() -> dict[str, Any]:
    coll = _runs_collection()
    if coll is None:
        return {"available": False, "note": "MONGODB_URI not configured"}
    pipeline = [
        {
            "$group": {
                "_id": {
                    "building_type": "$building_type",
                    "recommended": "$recommended",
                },
                "runs": {"$sum": 1},
                "avg_abatement": {"$avg": "$abatement_cost"},
                "avg_tco2e_saved": {"$avg": "$tco2e_delta"},
            }
        },
        {"$sort": {"runs": -1}},
    ]
    rows = [
        {
            "building_type": r["_id"]["building_type"],
            "recommended": r["_id"]["recommended"],
            "runs": r["runs"],
            "avg_abatement": r["avg_abatement"],
            "avg_tco2e_saved": r["avg_tco2e_saved"],
        }
        for r in coll.aggregate(pipeline)
    ]
    return {"available": True, "by_config": rows}


@router.get("/runs/mine")
def runs_mine(
    auth0_sub: str = Query(min_length=3),
    limit: int = Query(default=20, ge=1, le=50),
) -> dict[str, Any]:
    """List recent runs for a signed-in user.

    v1 trusts the client-provided auth0_sub (Auth0 UI gate). Production should
    verify the Auth0 JWT server-side before relying on this endpoint.
    """
    coll = _runs_collection()
    if coll is None:
        return {"available": False, "runs": [], "note": "MONGODB_URI not configured"}
    try:
        cursor = (
            coll.find({"auth0_sub": auth0_sub})
            .sort("ts", -1)
            .limit(limit)
        )
        runs = [_list_item(doc) for doc in cursor]
        return {"available": True, "runs": runs}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"runs query failed: {exc}") from exc


@router.get("/runs/{run_id}")
def run_detail(
    run_id: str,
    auth0_sub: str = Query(min_length=3),
) -> dict[str, Any]:
    """Return one run with its reopenable report blob (if stored).

    Scoped by auth0_sub (same trust model as /runs/mine). Older metadata-only
    runs return has_report=false and report=null.
    """
    coll = _runs_collection()
    if coll is None:
        raise HTTPException(status_code=503, detail="MONGODB_URI not configured")
    try:
        oid = ObjectId(run_id)
    except InvalidId as exc:
        raise HTTPException(status_code=400, detail="invalid run id") from exc
    try:
        doc = coll.find_one({"_id": oid, "auth0_sub": auth0_sub})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"runs query failed: {exc}") from exc
    if doc is None:
        raise HTTPException(status_code=404, detail="run not found")
    item = _list_item(doc)
    report = doc.get("report") if isinstance(doc.get("report"), dict) else None
    return {**item, "report": report}
