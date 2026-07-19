"""HTTP surface for multi-agent stress briefing."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agents.orchestrator import ALL_AGENT_IDS, run_briefing, run_year_briefing

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


@router.post("/briefing")
async def briefing(req: BriefingRequest) -> dict:
    if req.include_agents:
        unknown = [a for a in req.include_agents if a not in ALL_AGENT_IDS]
        if unknown:
            raise HTTPException(
                status_code=422,
                detail=f"unknown agents: {unknown}; known={ALL_AGENT_IDS}",
            )
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
        auth0_sub=req.auth0_sub,
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
    return payload


@router.post("/briefing/year")
async def briefing_year(req: YearBriefingRequest) -> dict:
    if req.include_agents:
        unknown = [a for a in req.include_agents if a not in ALL_AGENT_IDS]
        if unknown:
            raise HTTPException(
                status_code=422,
                detail=f"unknown agents: {unknown}; known={ALL_AGENT_IDS}",
            )
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
        auth0_sub=req.auth0_sub,
        structure_a=req.structure_a,
        hvac_a=req.hvac_a,
        structure_b=req.structure_b,
        hvac_b=req.hvac_b,
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
    return payload
