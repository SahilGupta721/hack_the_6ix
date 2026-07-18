"""Find empty build sites near a point via OpenStreetMap Overpass.

Prefers OSM land uses that are typically undeveloped (brownfield, grass,
parking, etc.). Never queries buildings or highways as candidates.
Falls back to approximate offset pads if Overpass is down.
"""

from __future__ import annotations

import math
from typing import Any

import httpx
from fastapi import APIRouter, Query

router = APIRouter(tags=["sites"])

OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
USER_AGENT = "INNSIGHT/0.1 (Hack the 6ix; empty-site finder)"

_LANDUSE_QUERY = """
[out:json][timeout:18];
(
  way["landuse"="brownfield"](around:{radius},{lat},{lng});
  way["landuse"="greenfield"](around:{radius},{lat},{lng});
  way["landuse"="construction"](around:{radius},{lat},{lng});
  way["landuse"="vacant"](around:{radius},{lat},{lng});
  way["amenity"="parking"]["parking"="surface"](around:{radius},{lat},{lng});
);
out geom;
"""

_LABELS = "ABCDE"

# Curated real parcels near the demo site, corners traced from the City of
# Toronto 2025 orthophoto (8 cm). Used when Overpass is unreachable so the
# venue demo never shows pads on rooftops.
_CURATED_TORONTO: list[dict[str, Any]] = [
    {
        "label": "Gravel lot south of rail corridor (traced from 2025 ortho)",
        "kind": "traced",
        "ring": [
            [-79.37360, 43.64456],
            [-79.37280, 43.64458],
            [-79.37277, 43.64418],
            [-79.37357, 43.64415],
            [-79.37360, 43.64456],
        ],
    },
    {
        "label": "Construction site west (traced from 2025 ortho)",
        "kind": "traced",
        "ring": [
            [-79.37806, 43.64576],
            [-79.37736, 43.64580],
            [-79.37731, 43.64537],
            [-79.37800, 43.64533],
            [-79.37806, 43.64576],
        ],
    },
]
_CURATED_CENTRE = (43.6474, -79.3736)
_CURATED_RANGE_DEG = 0.015  # ~1.5 km


def _curated_sites(lat: float, lng: float) -> list[dict[str, Any]] | None:
    if (
        abs(lat - _CURATED_CENTRE[0]) > _CURATED_RANGE_DEG
        or abs(lng - _CURATED_CENTRE[1]) > _CURATED_RANGE_DEG
    ):
        return None
    out: list[dict[str, Any]] = []
    for i, raw in enumerate(_CURATED_TORONTO):
        site_id = f"empty-{_LABELS[i]}"
        clng, clat = _centroid(raw["ring"])
        out.append(
            {
                "id": site_id,
                "label": raw["label"],
                "kind": raw["kind"],
                "center": {"lng": clng, "lat": clat},
                "polygon": {
                    "type": "Feature",
                    "properties": {
                        "id": site_id,
                        "label": raw["label"],
                        "kind": raw["kind"],
                    },
                    "geometry": {"type": "Polygon", "coordinates": [raw["ring"]]},
                },
            }
        )
    return out


# Last good Overpass result per rounded location; venue wifi insurance only.
_cache: dict[tuple[float, float], list[dict[str, Any]]] = {}


def _ring_from_geometry(geom: list[dict[str, float]]) -> list[list[float]] | None:
    if not geom or len(geom) < 3:
        return None
    ring = [[float(p["lon"]), float(p["lat"])] for p in geom]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    if len(ring) < 4:
        return None
    return ring


def _centroid(ring: list[list[float]]) -> tuple[float, float]:
    xs = [p[0] for p in ring[:-1]]
    ys = [p[1] for p in ring[:-1]]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def _area_approx(ring: list[list[float]]) -> float:
    a = 0.0
    for i in range(len(ring) - 1):
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(a) * 0.5


def _offset(lng: float, lat: float, east_m: float, north_m: float) -> tuple[float, float]:
    d_lat = north_m / 111_320.0
    cos_lat = math.cos(math.radians(lat)) or 1e-6
    d_lng = east_m / (111_320.0 * cos_lat)
    return lng + d_lng, lat + d_lat


def _rect(lng: float, lat: float, half_w: float, half_h: float) -> list[list[float]]:
    sw = _offset(lng, lat, -half_w, -half_h)
    se = _offset(lng, lat, half_w, -half_h)
    ne = _offset(lng, lat, half_w, half_h)
    nw = _offset(lng, lat, -half_w, half_h)
    return [list(sw), list(se), list(ne), list(nw), list(sw)]


def _fallback_sites(lat: float, lng: float, limit: int) -> list[dict[str, Any]]:
    """Offset pads away from the pin — never on the exact road center."""
    offsets = (
        (95, 70, 24, 28),
        (-90, 75, 26, 22),
        (80, -85, 22, 26),
        (-75, -80, 28, 24),
        (110, -40, 20, 24),
    )
    out: list[dict[str, Any]] = []
    for i, (e, n, w, h) in enumerate(offsets[:limit]):
        clng, clat = _offset(lng, lat, e, n)
        label = f"Empty site {_LABELS[i]} (approx.)"
        site_id = f"empty-{_LABELS[i]}"
        ring = _rect(clng, clat, w, h)
        out.append(
            {
                "id": site_id,
                "label": label,
                "kind": "approx",
                "center": {"lng": clng, "lat": clat},
                "polygon": {
                    "type": "Feature",
                    "properties": {"id": site_id, "label": label, "kind": "approx"},
                    "geometry": {"type": "Polygon", "coordinates": [ring]},
                },
            }
        )
    return out


def _elements_to_sites(elements: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    scored: list[tuple[float, dict[str, Any]]] = []
    for el in elements:
        geom = el.get("geometry")
        if not isinstance(geom, list):
            continue
        ring = _ring_from_geometry(geom)
        if not ring:
            continue
        area = _area_approx(ring)
        if area < 1e-9 or area > 8e-5:
            continue
        tags = el.get("tags") or {}
        kind = tags.get("landuse") or tags.get("natural") or tags.get("amenity") or "open"
        clng, clat = _centroid(ring)
        scored.append((area, {"kind": kind, "lng": clng, "lat": clat, "ring": ring}))

    scored.sort(key=lambda t: t[0], reverse=True)
    out: list[dict[str, Any]] = []
    for i, (_, raw) in enumerate(scored[:limit]):
        label = f"Empty site {_LABELS[i]} ({raw['kind']})"
        site_id = f"empty-{_LABELS[i]}"
        out.append(
            {
                "id": site_id,
                "label": label,
                "kind": raw["kind"],
                "center": {"lng": raw["lng"], "lat": raw["lat"]},
                "polygon": {
                    "type": "Feature",
                    "properties": {"id": site_id, "label": label, "kind": raw["kind"]},
                    "geometry": {"type": "Polygon", "coordinates": [raw["ring"]]},
                },
            }
        )
    return out


async def _query_overpass(lat: float, lng: float, radius: int) -> list[dict[str, Any]]:
    query = _LANDUSE_QUERY.format(lat=lat, lng=lng, radius=radius)
    last_err: Exception | None = None
    async with httpx.AsyncClient(timeout=22.0) as client:
        for url in OVERPASS_URLS:
            try:
                res = await client.post(
                    url,
                    data={"data": query},
                    headers={"User-Agent": USER_AGENT},
                )
                if res.status_code == 200:
                    return list((res.json() or {}).get("elements") or [])
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                continue
    if last_err:
        raise last_err
    return []


@router.get("/sites/empty")
async def empty_sites(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: int = Query(700, ge=150, le=2000),
    limit: int = Query(5, ge=1, le=8),
) -> dict[str, Any]:
    note_osm = (
        "OpenStreetMap surface parking / brownfield / construction land, not "
        "buildings or roads. Not a legal vacant-lot registry."
    )
    cache_key = (round(lat, 3), round(lng, 3))
    try:
        elements = await _query_overpass(lat, lng, radius)
        sites = _elements_to_sites(elements, limit)
        if sites:
            _cache[cache_key] = sites
            return {
                "sites": sites,
                "source": "openstreetmap-overpass",
                "note": note_osm,
                "count": len(sites),
            }
    except Exception:
        pass

    cached = _cache.get(cache_key)
    if cached:
        return {
            "sites": cached,
            "source": "openstreetmap-overpass-cached",
            "note": note_osm + " (served from this session's earlier lookup)",
            "count": len(cached),
        }

    curated = _curated_sites(lat, lng)
    if curated:
        return {
            "sites": curated,
            "source": "curated-orthophoto",
            "note": (
                "OSM lookup unavailable; showing parcels traced from the City "
                "of Toronto 2025 orthophoto."
            ),
            "count": len(curated),
        }

    sites = _fallback_sites(lat, lng, limit)
    return {
        "sites": sites,
        "source": "approx-fallback",
        "note": (
            "OSM empty-land lookup unavailable; approximate pads offset from "
            "the pin. Verify on imagery before placing."
        ),
        "count": len(sites),
    }
