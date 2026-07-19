import os
from dataclasses import asdict
from pathlib import Path

from dotenv import load_dotenv

# Single source of truth: repo-root `.env` only (no api/.env or web/.env.local).
_API_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _API_DIR.parent
load_dotenv(_REPO_ROOT / ".env")

# Make `import app...` reliable when cwd is not api/.
import sys

if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from innsight_model import MODEL_VERSION
from innsight_model.benchmarks import all_benchmarks
from innsight_model.load_profiles import PROFILES
from innsight_model.memo import build_memo, generate_narrative
from innsight_model.sim import (
    SCENARIOS,
    BuildingConfig,
    compare,
    run_option,
)

from app.agents.router import router as agents_router
from app.area import router as area_router
from app.geocode import router as geocode_router
from app.renders import router as renders_router
from app.sites import router as sites_router
from app.stay22 import router as stay22_router
from app.storage import record_run
from app.storage import router as storage_router
from app.users import router as users_router

SITE_NAME = "45 The Esplanade"

app = FastAPI(title="INNSIGHT API", version=MODEL_VERSION)

_default_origins = (
    "http://localhost:3000,http://localhost:3001,"
    "http://127.0.0.1:3000,http://127.0.0.1:3001"
)
app.add_middleware(
    CORSMiddleware,
    # Deployed frontends join via ALLOWED_ORIGINS (comma-separated, no
    # trailing slashes), e.g. the Vercel URL on Render.
    allow_origins=[
        o.strip()
        for o in os.environ.get("ALLOWED_ORIGINS", _default_origins).split(",")
        if o.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stay22_router)
app.include_router(renders_router)
app.include_router(storage_router)
app.include_router(users_router)
app.include_router(geocode_router)
app.include_router(sites_router)
app.include_router(area_router)
app.include_router(agents_router)


class SimulateRequest(BaseModel):
    building_type: str = Field(pattern="^(homestay|boutique|tower)$")
    rooms: int = Field(gt=0, le=1000)
    structure: str = Field(pattern="^(concrete|mass_timber|steel)$")
    hvac: str = Field(pattern="^(central_gas|heat_pump)$")
    scenario: str = "heatwave_full"
    label: str = ""


class CompareRequest(BaseModel):
    building_type: str = Field(pattern="^(homestay|boutique|tower)$")
    rooms: int = Field(gt=0, le=1000)
    scenario: str = "heatwave_full"
    structure_a: str = Field(default="concrete", pattern="^(concrete|mass_timber|steel)$")
    hvac_a: str = Field(default="central_gas", pattern="^(central_gas|heat_pump)$")
    structure_b: str = Field(default="mass_timber", pattern="^(concrete|mass_timber|steel)$")
    hvac_b: str = Field(default="heat_pump", pattern="^(central_gas|heat_pump)$")
    auth0_sub: str | None = None


def _scenario(name: str):
    if name not in SCENARIOS:
        raise HTTPException(status_code=422, detail=f"unknown scenario: {name}")
    return SCENARIOS[name]


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "INNSIGHT API",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model_version": MODEL_VERSION}


@app.get("/benchmarks")
def benchmarks() -> dict[str, dict[str, object]]:
    return {key: asdict(bm) for key, bm in all_benchmarks().items()}


@app.get("/scenarios")
def scenarios() -> dict[str, dict[str, object]]:
    return {
        key: {
            "name": s.name,
            "occupancy": s.occupancy,
            "hourly_temps_c": list(s.hourly_temps_c),
        }
        for key, s in SCENARIOS.items()
    }


@app.get("/profiles")
def profiles() -> dict[str, dict[str, object]]:
    return {
        key: {
            "label": p.label,
            "character": p.character,
            "hourly_shape": list(p.hourly_shape),
        }
        for key, p in PROFILES.items()
    }


@app.post("/simulate")
def simulate(req: SimulateRequest) -> dict[str, object]:
    config = BuildingConfig(
        req.building_type, req.rooms, req.structure, req.hvac, req.label
    )
    result = run_option(config, _scenario(req.scenario))
    payload = asdict(result)
    payload["config"] = asdict(result.config)
    return payload


@app.post("/memo")
def memo(req: CompareRequest) -> dict[str, object]:
    config_a = BuildingConfig(
        req.building_type, req.rooms, req.structure_a, req.hvac_a,
        "Option A: Concrete + Central HVAC"
        if req.structure_a == "concrete" and req.hvac_a == "central_gas"
        else f"Option A: {req.structure_a} + {req.hvac_a}",
    )
    config_b = BuildingConfig(
        req.building_type, req.rooms, req.structure_b, req.hvac_b,
        "Option B: Mass Timber + Heat Pumps"
        if req.structure_b == "mass_timber" and req.hvac_b == "heat_pump"
        else f"Option B: {req.structure_b} + {req.hvac_b}",
    )
    comparison = compare(config_a, config_b, _scenario(req.scenario))
    memo_data = build_memo(comparison, SITE_NAME)
    memo_data["narrative"] = generate_narrative(
        memo_data, (os.environ.get("GEMINI_API_KEY") or "").strip() or None
    )
    record_run(
        memo_data,
        auth0_sub=req.auth0_sub,
        structure_a=req.structure_a,
        hvac_a=req.hvac_a,
        structure_b=req.structure_b,
        hvac_b=req.hvac_b,
        report={"kind": "memo", "memo": memo_data},
    )
    return memo_data


@app.post("/compare")
def compare_options(req: CompareRequest) -> dict[str, object]:
    config_a = BuildingConfig(
        req.building_type, req.rooms, req.structure_a, req.hvac_a,
        "Option A: Concrete + Central HVAC"
        if req.structure_a == "concrete" and req.hvac_a == "central_gas"
        else f"Option A: {req.structure_a} + {req.hvac_a}",
    )
    config_b = BuildingConfig(
        req.building_type, req.rooms, req.structure_b, req.hvac_b,
        "Option B: Mass Timber + Heat Pumps"
        if req.structure_b == "mass_timber" and req.hvac_b == "heat_pump"
        else f"Option B: {req.structure_b} + {req.hvac_b}",
    )
    result = compare(config_a, config_b, _scenario(req.scenario))
    payload = asdict(result)
    payload["option_a"]["config"] = asdict(result.option_a.config)
    payload["option_b"]["config"] = asdict(result.option_b.config)
    return payload