"""Deterministic Rules & Compliance Engine.

Compares assembled massing (storeys, GFA, structure, rooms) against the
jurisdiction pack — City of Toronto zoning overlays, OBC notes, TGS, parking —
and returns side-by-side rows (model spec vs rule clause), not a hard gate.

All numeric overlays are labelled heuristic/estimate; not legal advice.
"""

from __future__ import annotations

import math
from typing import Any, Literal

CheckStatus = Literal["pass", "warn", "fail", "info"]
AppliesTo = Literal["both", "A", "B"]


def _f(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _fmt(v: float, digits: int = 1) -> str:
    if abs(v - round(v)) < 1e-9:
        return str(int(round(v)))
    return f"{v:.{digits}f}"


def _row(
    *,
    id: str,
    category: str,
    rule: str,
    clause: str,
    model_display: str,
    limit_display: str,
    status: CheckStatus,
    delta_display: str,
    applies_to: AppliesTo = "both",
    severity: str = "heuristic",
    model: float | None = None,
    limit: float | None = None,
    unit: str | None = None,
    delta: float | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    return {
        "id": id,
        "category": category,
        "rule": rule,
        "clause": clause,
        "model": model,
        "model_display": model_display,
        "limit": limit,
        "limit_display": limit_display,
        "unit": unit,
        "delta": delta,
        "delta_display": delta_display,
        "status": status,
        "applies_to": applies_to,
        "severity": severity,
        "note": note,
    }


def _max_status(model: float, limit: float, *, soft_pct: float = 0.9) -> CheckStatus:
    if model <= limit:
        return "pass"
    if model <= limit * (1.0 + (1.0 - soft_pct) * 2):  # slight overrun → warn band
        # Keep a narrow warn band just over the limit (~10%).
        if model <= limit * 1.1:
            return "warn"
    return "fail"


def _min_status(model: float, limit: float) -> CheckStatus:
    if model >= limit:
        return "pass"
    if model >= limit * 0.75:
        return "warn"
    return "fail"


def estimate_height_m(storeys: int | None, storey_height_m: float) -> float | None:
    if not storeys or storeys <= 0:
        return None
    return round(storeys * storey_height_m, 2)


def _benchmark_sqft(building_type: str) -> float:
    """Single source of truth: the sim's sourced per-room areas."""
    try:
        from innsight_model.benchmarks import SQFT_PER_ROOM

        record = SQFT_PER_ROOM.get(building_type)
        if record is not None:
            return float(record.value)
    except Exception:
        pass
    return 350.0


def estimate_gfa_m2(
    rooms: int,
    building_type: str,
    assumptions: dict[str, Any],
) -> float:
    sqft_map = assumptions.get("sqft_per_room") or {}
    sqft = _f(sqft_map.get(building_type), _benchmark_sqft(building_type))
    m2_per_sqft = _f(assumptions.get("m2_per_sqft"), 0.092903)
    return round(rooms * sqft * m2_per_sqft, 1)


def estimate_lot_metrics(
    acres: float | None,
    assumptions: dict[str, Any],
) -> dict[str, float | None]:
    """Approximate square-ish lot from acres when parcel dims are unavailable."""
    if acres is None or acres <= 0:
        return {"lot_area_m2": None, "lot_side_m": None, "lot_depth_m": None}
    lot_m2 = acres * 4046.8564224
    side = math.sqrt(lot_m2)
    depth_frac = _f(assumptions.get("lot_depth_fraction_of_sqrt"), 1.25)
    return {
        "lot_area_m2": round(lot_m2, 1),
        "lot_side_m": round(side, 1),
        "lot_depth_m": round(side * depth_frac, 1),
    }


def run_compliance_checks(ctx: dict[str, Any]) -> dict[str, Any]:
    """Build side-by-side compliance rows from gather context + pack."""
    pack = ctx.get("compliance") or {}
    cmp_ = ctx.get("comparison") or {}
    massing = ctx.get("massing") or {}
    site = ctx.get("site") or {}
    a = cmp_.get("option_a") or {}
    b = cmp_.get("option_b") or {}

    bt = str(a.get("building_type") or b.get("building_type") or "boutique")
    rooms = int(massing.get("rooms") or a.get("rooms") or b.get("rooms") or 0)
    storeys = massing.get("storeys")
    if storeys is not None:
        storeys = int(storeys)
    shape = str(massing.get("shape") or "slab")
    structure_a = a.get("structure")
    structure_b = b.get("structure")
    hvac_a = a.get("hvac")
    hvac_b = b.get("hvac")

    overlays = pack.get("site_overlays") or {}
    assumptions = pack.get("assumptions") or {}
    storey_h = _f(assumptions.get("storey_height_m"), 3.5)
    height_m = estimate_height_m(storeys, storey_h)
    gfa_m2 = estimate_gfa_m2(rooms, bt, assumptions) if rooms else 0.0
    acres = site.get("acres")
    if acres is not None:
        acres = _f(acres)
    lot = estimate_lot_metrics(acres, assumptions)

    zoning = pack.get("zoning_district") or {}
    checks: list[dict[str, Any]] = []

    # --- Zoning district (info) ---
    checks.append(
        _row(
            id="zoning_district",
            category="zoning",
            rule="Zoning district",
            clause=(
                f"{zoning.get('bylaw') or 'Zoning by-law'} — "
                f"{zoning.get('code') or 'site pack'}"
            ),
            model_display=f"{bt} · {rooms} rooms · {shape}",
            limit_display=str(zoning.get("code") or "Confirm on Zoning Map"),
            status="info",
            delta_display="Confirm designation",
            severity=str(zoning.get("status") or "heuristic"),
            note=zoning.get("note"),
        )
    )

    # --- Height ---
    max_h = overlays.get("max_height_m")
    if height_m is not None and max_h is not None:
        max_h_f = _f(max_h)
        delta = round(height_m - max_h_f, 2)
        status = _max_status(height_m, max_h_f)
        checks.append(
            _row(
                id="height_limit",
                category="zoning",
                rule="Maximum building height",
                clause=(
                    f"{zoning.get('bylaw') or 'Zoning By-law'} height overlay — "
                    f"site pack max {_fmt(max_h_f)} m"
                    + (
                        f" (~{overlays.get('max_storeys_hint')} storeys)"
                        if overlays.get("max_storeys_hint")
                        else ""
                    )
                ),
                model=height_m,
                model_display=(
                    f"{_fmt(height_m)} m ({storeys} storeys × {_fmt(storey_h)} m)"
                ),
                limit=max_h_f,
                limit_display=f"{_fmt(max_h_f)} m",
                unit="m",
                delta=delta,
                delta_display=(
                    f"{_fmt(abs(delta))} m under limit"
                    if delta <= 0
                    else f"{_fmt(delta)} m over limit"
                ),
                status=status,
                severity=str(overlays.get("status") or "heuristic"),
            )
        )
    elif max_h is not None:
        checks.append(
            _row(
                id="height_limit",
                category="zoning",
                rule="Maximum building height",
                clause=(
                    f"Site pack max {_fmt(_f(max_h))} m — set storeys in the "
                    "assembler to measure this design"
                ),
                model_display="Storeys not set",
                limit_display=f"{_fmt(_f(max_h))} m",
                status="info",
                delta_display="Need storeys",
                severity=str(overlays.get("status") or "heuristic"),
            )
        )

    # --- Angular plane (simplified 45° from front lot line) ---
    plane_deg = overlays.get("angular_plane_deg")
    lot_depth = lot.get("lot_depth_m")
    if (
        height_m is not None
        and plane_deg is not None
        and lot_depth is not None
        and _f(lot_depth) > 0
    ):
        rad = math.radians(_f(plane_deg))
        plane_cap = round(_f(lot_depth) * math.tan(rad), 1)
        delta = round(height_m - plane_cap, 2)
        status = _max_status(height_m, plane_cap)
        checks.append(
            _row(
                id="angular_plane",
                category="overlay",
                rule="Angular plane",
                clause=(
                    f"{_fmt(_f(plane_deg))}° angular plane from "
                    f"{overlays.get('angular_plane_from') or 'front lot line'} "
                    f"(simplified; lot depth ~ {_fmt(_f(lot_depth))} m from acres)"
                ),
                model=height_m,
                model_display=f"{_fmt(height_m)} m height",
                limit=plane_cap,
                limit_display=f"~ {_fmt(plane_cap)} m at {_fmt(_f(plane_deg))}°",
                unit="m",
                delta=delta,
                delta_display=(
                    f"{_fmt(abs(delta))} m under plane"
                    if delta <= 0
                    else f"{_fmt(delta)} m through plane"
                ),
                status=status,
                severity=str(overlays.get("status") or "heuristic"),
                note="Uses estimated lot depth from parcel acres, not a survey.",
            )
        )

    # --- Setbacks (fit check on estimated lot side) ---
    front = overlays.get("front_setback_m")
    side = overlays.get("side_setback_m")
    rear = overlays.get("rear_setback_m")
    lot_side = lot.get("lot_side_m")
    if front is not None and rear is not None and lot_side is not None:
        front_f, side_f, rear_f = _f(front), _f(side), _f(rear)
        buildable = round(_f(lot_side) - front_f - rear_f - 2 * side_f, 1)
        status: CheckStatus = (
            "pass" if buildable >= 8.0 else "warn" if buildable >= 4.0 else "fail"
        )
        checks.append(
            _row(
                id="setbacks",
                category="zoning",
                rule="Setbacks (buildable depth)",
                clause=(
                    f"Front {_fmt(front_f)} m / side {_fmt(side_f)} m / "
                    f"rear {_fmt(rear_f)} m — "
                    f"{zoning.get('bylaw') or 'zoning'} site pack"
                ),
                model=buildable,
                model_display=(
                    f"~ {_fmt(buildable)} m buildable on "
                    f"~{_fmt(_f(lot_side))} m lot side"
                ),
                limit=8.0,
                limit_display="≥ ~8 m buildable depth (heuristic)",
                unit="m",
                delta=round(buildable - 8.0, 1),
                delta_display=(
                    f"{_fmt(abs(buildable - 8.0))} m "
                    f"{'above' if buildable >= 8.0 else 'below'} heuristic floor"
                ),
                status=status,
                severity=str(overlays.get("status") or "heuristic"),
                note="Lot side derived from acres √area; not surveyed frontage.",
            )
        )
    elif front is not None:
        checks.append(
            _row(
                id="setbacks",
                category="zoning",
                rule="Setbacks",
                clause=(
                    f"Front {_fmt(_f(front))} m / side {_fmt(_f(side or 0))} m / "
                    f"rear {_fmt(_f(rear or 0))} m — confirm on zoning map"
                ),
                model_display="Parcel acres unavailable",
                limit_display=(
                    f"F {_fmt(_f(front))} · S {_fmt(_f(side or 0))} · "
                    f"R {_fmt(_f(rear or 0))} m"
                ),
                status="info",
                delta_display="Need parcel area",
                severity=str(overlays.get("status") or "heuristic"),
            )
        )

    # --- FSI / density ---
    fsi_max = overlays.get("fsi_max")
    lot_area = lot.get("lot_area_m2")
    if fsi_max is not None and lot_area and _f(lot_area) > 0 and gfa_m2 > 0:
        fsi = round(gfa_m2 / _f(lot_area), 2)
        fsi_lim = _f(fsi_max)
        delta = round(fsi - fsi_lim, 2)
        status = _max_status(fsi, fsi_lim)
        checks.append(
            _row(
                id="fsi",
                category="zoning",
                rule="Floor space index (FSI)",
                clause=(
                    f"Site pack max FSI {_fmt(fsi_lim, 2)} — "
                    f"GFA {_fmt(gfa_m2)} m² / lot {_fmt(_f(lot_area))} m²"
                ),
                model=fsi,
                model_display=f"FSI {_fmt(fsi, 2)}",
                limit=fsi_lim,
                limit_display=f"FSI {_fmt(fsi_lim, 2)}",
                unit="ratio",
                delta=delta,
                delta_display=(
                    f"{_fmt(abs(delta), 2)} under max"
                    if delta <= 0
                    else f"{_fmt(delta, 2)} over max"
                ),
                status=status,
                severity=str(overlays.get("status") or "heuristic"),
            )
        )

    # --- Parking ---
    per_room = overlays.get("parking_spaces_per_room")
    if per_room is not None and rooms > 0:
        required = round(rooms * _f(per_room), 1)
        # Assembler does not place stalls yet — flag demand as warn/info.
        checks.append(
            _row(
                id="parking",
                category="overlay",
                rule="Parking demand (hospitality)",
                clause=(
                    f"Site pack {_fmt(_f(per_room), 2)} spaces/room "
                    f"(~ {_fmt(required, 1)} stalls for {rooms} rooms). "
                    f"{overlays.get('parking_note') or ''}"
                ).strip(),
                model=0.0,
                model_display="0 stalls modelled (assembler has no parking deck yet)",
                limit=required,
                limit_display=f"~ {_fmt(required, 1)} stalls discussed",
                unit="stalls",
                delta=round(0.0 - required, 1),
                delta_display=f"{_fmt(required, 1)} stalls to resolve at site plan",
                status="warn" if required > 0 else "info",
                severity=str(overlays.get("status") or "heuristic"),
            )
        )

    # --- EMTC / mass timber (per option) ---
    emtc = next(
        (x for x in (pack.get("building_code") or []) if x.get("id") == "emtc_height"),
        None,
    )
    for key, structure, applies in (
        ("A", structure_a, "A"),
        ("B", structure_b, "B"),
    ):
        if structure != "mass_timber" or not emtc:
            continue
        lim_storeys = emtc.get("limit_storeys")
        lim_m = emtc.get("limit_m")
        if storeys is not None and lim_storeys is not None:
            lim_s = int(lim_storeys)
            delta_s = storeys - lim_s
            status = _max_status(float(storeys), float(lim_s))
            checks.append(
                _row(
                    id=f"emtc_storeys_{key}",
                    category="building_code",
                    rule=f"EMTC storeys (Option {key})",
                    clause=str(emtc.get("clause") or "OBC EMTC height/area limits"),
                    model=float(storeys),
                    model_display=f"{storeys} storeys · mass timber",
                    limit=float(lim_s),
                    limit_display=f"≤ {lim_s} storeys (pack)",
                    unit="storeys",
                    delta=float(delta_s),
                    delta_display=(
                        f"{abs(delta_s)} under limit"
                        if delta_s <= 0
                        else f"{delta_s} over limit"
                    ),
                    status=status,
                    applies_to=applies,  # type: ignore[arg-type]
                    severity=str(emtc.get("status") or "estimate"),
                    note=emtc.get("note"),
                )
            )
        elif height_m is not None and lim_m is not None:
            lim_mf = _f(lim_m)
            delta = round(height_m - lim_mf, 2)
            status = _max_status(height_m, lim_mf)
            checks.append(
                _row(
                    id=f"emtc_height_{key}",
                    category="building_code",
                    rule=f"EMTC height (Option {key})",
                    clause=str(emtc.get("clause") or "OBC EMTC height/area limits"),
                    model=height_m,
                    model_display=f"{_fmt(height_m)} m · mass timber",
                    limit=lim_mf,
                    limit_display=f"≤ {_fmt(lim_mf)} m (pack)",
                    unit="m",
                    delta=delta,
                    delta_display=(
                        f"{_fmt(abs(delta))} m under limit"
                        if delta <= 0
                        else f"{_fmt(delta)} m over limit"
                    ),
                    status=status,
                    applies_to=applies,  # type: ignore[arg-type]
                    severity=str(emtc.get("status") or "estimate"),
                    note=emtc.get("note"),
                )
            )
        else:
            checks.append(
                _row(
                    id=f"emtc_info_{key}",
                    category="building_code",
                    rule=f"EMTC (Option {key})",
                    clause=str(emtc.get("clause") or "OBC EMTC"),
                    model_display="Mass timber selected",
                    limit_display=(
                        f"≤ {emtc.get('limit_storeys')} storeys / "
                        f"{emtc.get('limit_m')} m (pack)"
                    ),
                    status="info",
                    delta_display="Set storeys to measure",
                    applies_to=applies,  # type: ignore[arg-type]
                    severity=str(emtc.get("status") or "estimate"),
                    note=emtc.get("note"),
                )
            )

    # --- OBC Part 3 / TGS / gas (info rows tied to design) ---
    for item in pack.get("building_code") or []:
        if item.get("id") in ("emtc_height",):
            continue
        checks.append(
            _row(
                id=str(item.get("id") or item.get("item")),
                category="building_code",
                rule=str(item.get("item") or "Building code"),
                clause=str(item.get("clause") or item.get("note") or ""),
                model_display=f"{bt} hospitality massing",
                limit_display="Pathway check required",
                status="info",
                delta_display="Review",
                severity=str(item.get("status") or "heuristic"),
                note=item.get("note"),
            )
        )

    for item in pack.get("energy_and_climate") or []:
        status: CheckStatus = "info"
        model_display = f"A:{hvac_a or '—'} · B:{hvac_b or '—'}"
        if item.get("id") == "central_gas" and (
            hvac_a == "central_gas" or hvac_b == "central_gas"
        ):
            status = "warn"
            which = []
            if hvac_a == "central_gas":
                which.append("A")
            if hvac_b == "central_gas":
                which.append("B")
            model_display = f"Gas plant on Option {'/'.join(which)}"
        elif item.get("id") == "tgs" and (
            hvac_b == "heat_pump" or structure_b == "mass_timber"
        ):
            model_display = "Option B aligns with electrification / lower embodied path"
        checks.append(
            _row(
                id=str(item.get("id") or item.get("item")),
                category="energy",
                rule=str(item.get("item") or "Energy"),
                clause=str(item.get("clause") or item.get("note") or ""),
                model_display=model_display,
                limit_display="Policy / TGS pathway",
                status=status,
                delta_display="See clause",
                severity=str(item.get("status") or "heuristic"),
                note=item.get("note"),
            )
        )

    for item in pack.get("hospitality_ops") or []:
        # Homestay STR note is more relevant for homestay type.
        status = "info"
        if item.get("id") == "str_licence" and bt == "homestay":
            status = "warn"
        checks.append(
            _row(
                id=str(item.get("id") or item.get("item")),
                category="ops",
                rule=str(item.get("item") or "Hospitality ops"),
                clause=str(item.get("clause") or item.get("note") or ""),
                model_display=f"Type: {bt}",
                limit_display="Licensing / tax pathway",
                status=status,
                delta_display="Confirm locally",
                severity=str(item.get("status") or "heuristic"),
                note=item.get("note"),
            )
        )

    tallies = {"pass": 0, "warn": 0, "fail": 0, "info": 0}
    for c in checks:
        tallies[str(c["status"])] = tallies.get(str(c["status"]), 0) + 1

    return {
        "jurisdiction": pack.get("jurisdiction"),
        "disclaimer": pack.get("disclaimer"),
        "zoning_district": zoning.get("code"),
        "massing": {
            "building_type": bt,
            "rooms": rooms,
            "storeys": storeys,
            "shape": shape,
            "height_m": height_m,
            "gfa_m2": gfa_m2,
            "acres": acres,
            "lot": lot,
        },
        "checks": checks,
        "tallies": tallies,
        "gate": False,
        "note": (
            "Side-by-side compliance read — not a pass/fail permit gate. "
            "Sim recommendation stays economic; this shows what the massing "
            "is measured against."
        ),
    }
