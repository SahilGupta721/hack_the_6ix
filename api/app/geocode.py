"""Geocode proxy for OpenStreetMap Nominatim (browser-safe User-Agent)."""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(tags=["geocode"])

NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "INNSIGHT/0.1 (Hack the 6ix; contact: innsight.app)"


@router.get("/geocode")
async def geocode(
    q: str = Query(min_length=2, max_length=200),
) -> list[dict[str, Any]]:
    params = {
        "q": q,
        "format": "json",
        "addressdetails": 0,
        "limit": 5,
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(
                NOMINATIM,
                params=params,
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"geocode upstream error: {exc}") from exc

    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"geocode status {res.status_code}")

    hits = res.json()
    out: list[dict[str, Any]] = []
    for hit in hits:
        item: dict[str, Any] = {
            "displayName": hit.get("display_name", ""),
            "lat": float(hit["lat"]),
            "lng": float(hit["lon"]),
        }
        bb = hit.get("boundingbox")
        if isinstance(bb, list) and len(bb) == 4:
            south, north, west, east = (float(x) for x in bb)
            item["bbox"] = [west, south, east, north]
        out.append(item)
    return out
