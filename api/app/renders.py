"""Option A vs B streetscape renders via Gemini image output (Nano Banana).

Illustrative imagery only, labelled as such in the UI. Prompts follow the
active storeys / plan shape / structure / facade / HVAC / site so the picture
tracks the assembler (still not permit-ready). Cached in process memory per
config fingerprint. Without GEMINI_API_KEY the endpoints 404 and the UI falls
back to static web/public files or hides.
"""

from __future__ import annotations

import hashlib
import os

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter()

IMAGE_MODEL = "gemini-2.5-flash-image"

# Defaults match the original demo assets (static fallbacks in web/public).
DEFAULT_PROMPTS = {
    "A": (
        "Photorealistic eye-level streetscape render of a new 8-storey "
        "conventional concrete-and-glass boutique hotel on The Esplanade in "
        "downtown Toronto, summer afternoon, rooftop mechanical units visible, "
        "grey precast facade, street trees, pedestrians. No text or logos."
    ),
    "B": (
        "Photorealistic eye-level streetscape render of a new 8-storey mass "
        "timber boutique hotel on The Esplanade in downtown Toronto, summer "
        "afternoon, warm exposed wood structure and large windows, discreet "
        "rooftop heat-pump units, street trees, pedestrians. No text or logos."
    ),
}

_SHAPE_PHRASE = {
    "slab": "simple rectangular slab massing",
    "l_wing": "L-shaped wing massing wrapping the corner",
    "courtyard": (
        "courtyard / O-plan massing with a clearly visible central open court "
        "and inward-facing elevations"
    ),
    "podium_tower": (
        "podium base with a slender tower rising above (stepped massing)"
    ),
}

_STRUCTURE_PHRASE = {
    "concrete": "reinforced concrete primary structure with a grey concrete expression",
    "mass_timber": "exposed mass-timber primary structure with warm wood tone",
    "steel": "steel-frame primary structure with contemporary cladding",
}

_FACADE_PHRASE = {
    "curtain_wall": "glass curtain-wall facade",
    "rainscreen": "opaque rainscreen cladding with punched openings",
}

_HVAC_PHRASE = {
    "central_gas": "visible rooftop central-plant / mechanical equipment",
    "heat_pump": "discreet rooftop heat-pump units",
}

_BUILDING_TYPE_PHRASE = {
    "homestay": "small-scale hospitality homestay",
    "boutique": "boutique hotel",
    "tower": "taller hospitality tower",
}

_cache: dict[str, bytes] = {}
_CACHE_MAX = 24


def build_prompt(
    option: str,
    *,
    storeys: int | None = None,
    shape: str | None = None,
    structure: str | None = None,
    hvac: str | None = None,
    facade: str | None = None,
    site_name: str | None = None,
    building_type: str | None = None,
    rooms: int | None = None,
) -> str:
    """Compose an illustrative streetscape prompt from assembler inputs."""
    if (
        storeys is None
        and not shape
        and not structure
        and not hvac
        and not facade
        and not site_name
    ):
        return DEFAULT_PROMPTS[option]

    n = max(1, min(int(storeys or 8), 40))
    shape_key = (shape or "slab").strip().lower()
    structure_key = (
        structure or ("concrete" if option == "A" else "mass_timber")
    ).strip()
    hvac_key = (hvac or ("central_gas" if option == "A" else "heat_pump")).strip()
    facade_key = (
        facade or ("curtain_wall" if option == "A" else "rainscreen")
    ).strip()
    btype = (building_type or "boutique").strip().lower()
    site = (site_name or "a downtown Toronto site").strip()[:80]
    room_bit = f"{rooms}-room " if rooms else ""

    shape_p = _SHAPE_PHRASE.get(shape_key, _SHAPE_PHRASE["slab"])
    structure_p = _STRUCTURE_PHRASE.get(structure_key, _STRUCTURE_PHRASE["concrete"])
    facade_p = _FACADE_PHRASE.get(facade_key, _FACADE_PHRASE["curtain_wall"])
    hvac_p = _HVAC_PHRASE.get(hvac_key, _HVAC_PHRASE["central_gas"])
    type_p = _BUILDING_TYPE_PHRASE.get(btype, "hospitality building")

    return (
        f"Photorealistic eye-level streetscape render of a new {n}-storey "
        f"{room_bit}{type_p} at {site}, Toronto. "
        f"Plan/massing: {shape_p}. "
        f"Structure: {structure_p}. "
        f"Envelope: {facade_p}. "
        f"Services: {hvac_p}. "
        "Summer afternoon light, street trees, pedestrians, urban context. "
        "Match the described massing and materials clearly. "
        "No text, logos, watermarks, or UI chrome. "
        "Illustrative concept imagery, not a permit drawing."
    )


def _cache_key(option: str, prompt: str) -> str:
    digest = hashlib.sha256(f"{option}|{prompt}".encode("utf-8")).hexdigest()[:24]
    return f"{option}:{digest}"


def _generate_from_prompt(prompt: str, api_key: str) -> bytes:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=IMAGE_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
            image_config=types.ImageConfig(aspect_ratio="16:9"),
        ),
    )
    for part in response.parts:
        if part.inline_data is not None:
            return part.inline_data.data
    raise ValueError("no image part in response")


# Back-compat for api/scripts/gen_renders.py
PROMPTS = DEFAULT_PROMPTS


def _generate(option: str, api_key: str) -> bytes:
    """Generate the default static A/B fallback image."""
    return _generate_from_prompt(DEFAULT_PROMPTS[option], api_key)


@router.get("/render/{option}")
def render(
    option: str,
    storeys: int | None = Query(default=None, ge=1, le=40),
    shape: str | None = Query(default=None),
    structure: str | None = Query(default=None),
    hvac: str | None = Query(default=None),
    facade: str | None = Query(default=None),
    site_name: str | None = Query(default=None, max_length=120),
    building_type: str | None = Query(default=None),
    rooms: int | None = Query(default=None, ge=1, le=1000),
) -> Response:
    option = option.upper()
    if option not in ("A", "B"):
        raise HTTPException(status_code=422, detail="option must be A or B")
    api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=404, detail="renders unavailable, no key")

    prompt = build_prompt(
        option,
        storeys=storeys,
        shape=shape,
        structure=structure,
        hvac=hvac,
        facade=facade,
        site_name=site_name,
        building_type=building_type,
        rooms=rooms,
    )
    key = _cache_key(option, prompt)
    if key not in _cache:
        try:
            png = _generate_from_prompt(prompt, api_key)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"render failed: {exc}") from exc
        if len(_cache) >= _CACHE_MAX:
            _cache.pop(next(iter(_cache)), None)
        _cache[key] = png
    return Response(content=_cache[key], media_type="image/png")
