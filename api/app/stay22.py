"""Stay22 Direct Travel API, demo mode (no key, 5 req/min, live calls only).

Terms compliance: live calls only, no cold storage of listings, no bulk
analysis. The only state kept is the last successful response in process
memory, used strictly as an offline fallback and labelled "cached" when
served. Nothing touches disk or a database.
"""

import statistics
from datetime import date, timedelta
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

router = APIRouter()

BASE_URL = "https://api.stay22.com/v2/accommodations"
SITE_LAT = 43.6476
SITE_LNG = -79.3744

_last_success: dict[str, Any] | None = None


def _next_saturday() -> date:
    today = date.today()
    return today + timedelta(days=(5 - today.weekday()) % 7 or 7)


async def _search(client: httpx.AsyncClient, checkin: date, checkout: date) -> dict[str, Any]:
    response = await client.get(
        BASE_URL,
        params={
            "lat": SITE_LAT,
            "lng": SITE_LNG,
            "radius": 3000,
            "checkin": checkin.isoformat(),
            "checkout": checkout.isoformat(),
            "adults": 2,
            "currency": "CAD",
            "pageSize": 20,
        },
        timeout=8.0,
    )
    response.raise_for_status()
    return response.json()


def _summarize(payload: dict[str, Any]) -> dict[str, Any]:
    prices: list[float] = []
    for item in payload.get("results", []):
        supplier_prices = [
            s["price"]["total"]
            for s in item.get("suppliers", {}).values()
            if isinstance(s, dict) and s.get("price", {}).get("total")
        ]
        if supplier_prices:
            prices.append(min(supplier_prices))
    return {
        "properties": len(payload.get("results", [])),
        "priced": len(prices),
        "median_rate": round(statistics.median(prices), 0) if prices else None,
        "min_rate": round(min(prices), 0) if prices else None,
    }


@router.get("/stay22/market")
async def market(checkin: str | None = None) -> dict[str, Any]:
    """Live forward-date market pressure near the site: the target weekend
    priced against a shoulder weekend four weeks later."""
    global _last_success

    target_in = date.fromisoformat(checkin) if checkin else _next_saturday()
    target_out = target_in + timedelta(days=1)
    baseline_in = target_in + timedelta(days=28)
    baseline_out = baseline_in + timedelta(days=1)

    try:
        async with httpx.AsyncClient() as client:
            target_raw = await _search(client, target_in, target_out)
            baseline_raw = await _search(client, baseline_in, baseline_out)
        target = _summarize(target_raw)
        baseline = _summarize(baseline_raw)
        demand_ratio = (
            round(target["median_rate"] / baseline["median_rate"], 3)
            if target["median_rate"] and baseline["median_rate"]
            else None
        )
        result = {
            "source": "live",
            "checkin": target_in.isoformat(),
            "baseline_checkin": baseline_in.isoformat(),
            "target": target,
            "baseline": baseline,
            "demand_ratio": demand_ratio,
            "note": "Live Stay22 demo-mode pull, 3 km around 45 The Esplanade. "
            "No listings are stored.",
        }
        _last_success = result
        return result
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        if _last_success is not None:
            return {**_last_success, "source": "cached", "note": (
                "Live pull failed; serving this session's earlier pull. "
                "Disclosed as cached in the demo."
            )}
        raise HTTPException(status_code=503, detail=f"Stay22 unreachable: {exc}")
