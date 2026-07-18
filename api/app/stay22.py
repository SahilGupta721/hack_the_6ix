"""Stay22 Direct Travel API, demo mode (no key, 5 req/min, live calls only).

Terms compliance: live calls only, no cold storage of listings, no bulk
analysis. The only state kept is the last successful response in process
memory, used strictly as an offline fallback and labelled "cached" when
served. Nothing touches disk or a database.
"""

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.agents.gather import fetch_stay22_market

router = APIRouter()


@router.get("/stay22/market")
async def market(
    checkin: str | None = None,
    lat: float | None = Query(default=None),
    lng: float | None = Query(default=None),
) -> dict[str, Any]:
    """Live forward-date market pressure near the site: the target weekend
    priced against a shoulder weekend four weeks later."""
    result = await fetch_stay22_market(checkin, lat=lat, lng=lng)
    if result.get("error") and result.get("source") != "cached":
        raise HTTPException(
            status_code=503,
            detail=result.get("note") or "Stay22 unreachable",
        )
    # Strip internal error key for the public pulse endpoint
    return {k: v for k, v in result.items() if k != "error"}
