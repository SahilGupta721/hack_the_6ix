"""HTTP surface for multi-agent stress briefing."""

from __future__ import annotations

from fastapi import Depends, APIRouter, HTTPException
from app.auth import current_sub, enforcement_on
from pydantic import BaseModel, Field

from app.agents.orchestrator import ALL_AGENT_IDS, run_briefing, run_year_briefing
from app.agents.chat import ChatRequest, answer_chat

router = APIRouter()


class BriefingRequest(BaseModel):
    building_type: str = Field(pattern="^(homestay|boutique|tower)$")
    rooms: int = Field(gt=0, le=1000)
    scenario: str = "heatwave_full"
    structure_a: str = Field(default="concrete", pattern="^(concrete|mass_timber|steel)$")
    hvac_a: str = Field(default="central_gas", pattern="^(central_gas|heat_pump)$")
    structure_b: str = Field(default="mass_timber", pattern="^(concrete|mass_timber|steel)$")
    hvac_b: str = Field(default="heat_pump", pattern="^(central_gas|heat_pump)$")
    include_agents: list[str] | None = None
    auth0_sub: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    storeys: int | None = Field(default=None, ge=1, le=40)
    shape: str | None = Field(
        default="slab",
        pattern="^(slab|l_wing|courtyard|podium_tower)$",
    )
    acres: float | None = Field(default=None, gt=0, le=100)
    force_refresh: bool = False


class YearBriefingRequest(BaseModel):
    building_type: str = Field(pattern="^(homestay|boutique|tower)$")
    rooms: int = Field(gt=0, le=1000)
    structure_a: str = Field(default="concrete", pattern="^(concrete|mass_timber|steel)$")
    hvac_a: str = Field(default="central_gas", pattern="^(central_gas|heat_pump)$")
    structure_b: str = Field(default="mass_timber", pattern="^(concrete|mass_timber|steel)$")
    hvac_b: str = Field(default="heat_pump", pattern="^(central_gas|heat_pump)$")
    include_agents: list[str] | None = None
    auth0_sub: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    site_name: str | None = None
    storeys: int | None = Field(default=None, ge=1, le=40)
    shape: str | None = Field(
        default="slab",
        pattern="^(slab|l_wing|courtyard|podium_tower)$",
    )
    acres: float | None = Field(default=None, gt=0, le=100)
    force_refresh: bool = False


def _try_cache(
    *,
    kind: str,
    building_type: str,
    rooms: int,
    structure_a: str,
    hvac_a: str,
    structure_b: str,
    hvac_b: str,
    lat: float | None,
    lng: float | None,
    storeys: int | None,
    shape: str | None,
    auth0_sub: str | None,
    scenario: str | None = None,
    force_refresh: bool = False,
) -> dict | None:
    if force_refresh:
        return None
    from app.storage import (
        cached_payload_from_doc,
        find_cached_run,
        run_fingerprint,
    )

    fp = run_fingerprint(
        kind=kind,
        building_type=building_type,
        rooms=rooms,
        structure_a=structure_a,
        hvac_a=hvac_a,
        structure_b=structure_b,
        hvac_b=hvac_b,
        lat=lat,
        lng=lng,
        scenario=scenario,
        storeys=storeys,
        shape=shape,
    )
    doc = find_cached_run(fp, auth0_sub=auth0_sub)
    if doc is None:
        return None
    # Stale packs built without Gemini — do not reuse once a key may be present.
    reason = (
        (doc.get("briefing_fallback_reason") or doc.get("fallback_reason") or "")
        .strip()
        .lower()
    )
    if reason in {"no_api_key", "no-api-key"} or "no_api_key" in reason:
        return None
    report = doc.get("report") if isinstance(doc.get("report"), dict) else {}
    report_reason = str(report.get("fallback_reason") or "").strip().lower()
    if report_reason in {"no_api_key", "no-api-key"} or "no_api_key" in report_reason:
        return None
    return cached_payload_from_doc(doc)


@router.post("/briefing")
async def briefing(
    req: BriefingRequest,
    verified_sub: str | None = Depends(current_sub),
) -> dict:
    if req.include_agents:
        unknown = [a for a in req.include_agents if a not in ALL_AGENT_IDS]
        if unknown:
            raise HTTPException(
                status_code=422,
                detail=f"unknown agents: {unknown}; known={ALL_AGENT_IDS}",
            )

    cached = _try_cache(
        kind="briefing",
        building_type=req.building_type,
        rooms=req.rooms,
        structure_a=req.structure_a,
        hvac_a=req.hvac_a,
        structure_b=req.structure_b,
        hvac_b=req.hvac_b,
        lat=req.lat,
        lng=req.lng,
        storeys=req.storeys,
        shape=req.shape,
        auth0_sub=req.auth0_sub,
        scenario=req.scenario,
        force_refresh=req.force_refresh,
    )
    if cached is not None:
        return cached

    try:
        result = await run_briefing(
            building_type=req.building_type,
            rooms=req.rooms,
            scenario=req.scenario,
            structure_a=req.structure_a,
            hvac_a=req.hvac_a,
            structure_b=req.structure_b,
            hvac_b=req.hvac_b,
            include_agents=req.include_agents,
            lat=req.lat,
            lng=req.lng,
            storeys=req.storeys,
            shape=req.shape,
            acres=req.acres,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    from app.storage import record_briefing_run

    payload = result.model_dump()
    briefs_dump = {k: v.model_dump() for k, v in result.briefs.items()}
    record_briefing_run(
        comparison=result.comparison,
        generator=result.generator,
        fallback_reason=result.fallback_reason,
        briefs=briefs_dump,
        auth0_sub=verified_sub if enforcement_on() else req.auth0_sub,
        lat=req.lat,
        lng=req.lng,
        storeys=req.storeys,
        shape=req.shape,
        scenario=req.scenario,
        structure_a=req.structure_a,
        hvac_a=req.hvac_a,
        structure_b=req.structure_b,
        hvac_b=req.hvac_b,
        building_type=req.building_type,
        rooms=req.rooms,
        report={
            "kind": "briefing",
            "comparison": payload["comparison"],
            "briefs": payload["briefs"],
            "synthesis": payload["synthesis"],
            "generator": payload["generator"],
            "fallback_reason": payload.get("fallback_reason"),
            "ai_energy": payload.get("ai_energy"),
        },
    )
    return {**payload, "from_cache": False}


@router.post("/briefing/year")
async def briefing_year(
    req: YearBriefingRequest,
    verified_sub: str | None = Depends(current_sub),
) -> dict:
    if req.include_agents:
        unknown = [a for a in req.include_agents if a not in ALL_AGENT_IDS]
        if unknown:
            raise HTTPException(
                status_code=422,
                detail=f"unknown agents: {unknown}; known={ALL_AGENT_IDS}",
            )

    cached = _try_cache(
        kind="year_pack",
        building_type=req.building_type,
        rooms=req.rooms,
        structure_a=req.structure_a,
        hvac_a=req.hvac_a,
        structure_b=req.structure_b,
        hvac_b=req.hvac_b,
        lat=req.lat,
        lng=req.lng,
        storeys=req.storeys,
        shape=req.shape,
        auth0_sub=req.auth0_sub,
        scenario=None,
        force_refresh=req.force_refresh,
    )
    if cached is not None:
        return cached

    try:
        result = await run_year_briefing(
            building_type=req.building_type,
            rooms=req.rooms,
            structure_a=req.structure_a,
            hvac_a=req.hvac_a,
            structure_b=req.structure_b,
            hvac_b=req.hvac_b,
            include_agents=req.include_agents,
            site_name=req.site_name or "45 The Esplanade, Toronto",
            lat=req.lat,
            lng=req.lng,
            storeys=req.storeys,
            shape=req.shape,
            acres=req.acres,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    from app.storage import record_year_pack_run

    payload = result.model_dump()
    briefs_dump = {k: v.model_dump() for k, v in result.briefs.items()}
    record_year_pack_run(
        memo=result.memo,
        matrix_summary=result.matrix_summary,
        generator=result.generator,
        fallback_reason=result.fallback_reason,
        briefs=briefs_dump,
        auth0_sub=verified_sub if enforcement_on() else req.auth0_sub,
        structure_a=req.structure_a,
        hvac_a=req.hvac_a,
        structure_b=req.structure_b,
        hvac_b=req.hvac_b,
        lat=req.lat,
        lng=req.lng,
        storeys=req.storeys,
        shape=req.shape,
        building_type=req.building_type,
        rooms=req.rooms,
        report={
            "kind": "year_pack",
            "scenarios": payload["scenarios"],
            "matrix_summary": payload["matrix_summary"],
            "briefs": payload["briefs"],
            "synthesis": payload["synthesis"],
            "memo": payload["memo"],
            "generator": payload["generator"],
            "fallback_reason": payload.get("fallback_reason"),
            "comparison": payload["comparison"],
            "climate": payload.get("climate"),
            "ai_energy": payload.get("ai_energy"),
        },
    )
    return {**payload, "from_cache": False}


@router.post("/chat")
async def chat(req: ChatRequest) -> dict:
    """App-scoped Q&A grounded on handbook chunks + optional live memo."""
    return answer_chat(req).model_dump()
