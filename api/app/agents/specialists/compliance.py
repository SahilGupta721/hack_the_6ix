from __future__ import annotations

from typing import Any

from app.agents.compliance_engine import run_compliance_checks
from app.agents.llm import LLMProvider
from app.agents.schemas import AgentBrief
from app.agents.specialists import run_specialist, src


def analyze_compliance(provider: LLMProvider, ctx: dict[str, Any]) -> AgentBrief:
    pack = ctx.get("compliance") or {}
    cmp_ = ctx.get("comparison") or {}
    a = cmp_.get("option_a") or {}
    bt = a.get("building_type") or "boutique"
    type_notes = (pack.get("building_type_notes") or {}).get(bt, "")

    report = run_compliance_checks(ctx)
    checks = report.get("checks") or []
    tallies = report.get("tallies") or {}

    findings: list[str] = [
        f"Jurisdiction: {report.get('jurisdiction') or pack.get('jurisdiction')}.",
        (
            f"Zoning pack: {report.get('zoning_district') or 'confirm on map'}."
        ),
    ]
    if type_notes:
        findings.append(f"Building-type note ({bt}): {type_notes}")

    # Surface the most actionable measured rows first (fail → warn → pass).
    ranked = sorted(
        [c for c in checks if c.get("status") in ("fail", "warn", "pass")],
        key=lambda c: {"fail": 0, "warn": 1, "pass": 2}.get(str(c.get("status")), 3),
    )
    for c in ranked[:3]:
        findings.append(
            f"{c.get('rule')}: model {c.get('model_display')} vs "
            f"{c.get('limit_display')} ({c.get('delta_display')}) — {c.get('status')}."
        )

    massing = report.get("massing") or {}
    if massing.get("height_m") is not None:
        findings.append(
            f"Assembled height ≈ {massing['height_m']} m "
            f"({massing.get('storeys')} storeys)."
        )

    risks = [
        pack.get("disclaimer")
        or "Compliance pack is an estimate/heuristic checklist, not legal advice.",
        "Site plan / TGS applicability depends on actual planning pathway.",
        report.get("note")
        or "Side-by-side read only — not a pass/fail permit gate.",
    ]

    structure_a = a.get("structure")
    structure_b = (cmp_.get("option_b") or {}).get("structure")

    sources = [
        src(
            "Rules & Compliance Engine: model vs Toronto/Ontario pack clauses",
            "heuristic",
        ),
    ]
    for s in pack.get("sources") or []:
        sources.append(
            src(
                str(s.get("label") or "Compliance source"),
                str(s.get("status") or "estimate"),
                url=s.get("url"),
            )
        )

    engine_metrics: dict[str, Any] = {
        "jurisdiction": report.get("jurisdiction") or pack.get("jurisdiction"),
        "building_type": bt,
        "structure_a": structure_a,
        "structure_b": structure_b,
        "hvac_a": a.get("hvac"),
        "hvac_b": (cmp_.get("option_b") or {}).get("hvac"),
        "zoning_district": report.get("zoning_district"),
        "tallies": tallies,
        "gate": False,
        "checks": checks,
        "massing": massing,
        "disclaimer": report.get("disclaimer"),
    }

    stub = AgentBrief(
        agent_id="compliance",
        title="Rules & compliance",
        findings=findings[:6],
        metrics=engine_metrics,
        risks=risks[:4],
        sources=sources[:4],
        confidence=0.55,
    )
    brief = run_specialist(
        provider,
        agent_id="compliance",
        title="Rules & compliance",
        focus=(
            "Side-by-side: assembled massing vs City of Toronto zoning overlays, "
            "OBC/EMTC, TGS, setbacks, angular plane, parking — show which clause "
            "is violated and by how much. Not a hard gate; not legal advice."
        ),
        context={
            "compliance": pack,
            "comparison": cmp_,
            "massing": ctx.get("massing"),
            "compliance_report": {
                "tallies": tallies,
                "checks": checks[:12],
                "disclaimer": report.get("disclaimer"),
            },
        },
        stub=stub,
    )
    # Always keep deterministic engine rows for the UI (LLM must not drop them).
    merged = dict(brief.metrics or {})
    merged.update(engine_metrics)
    brief.metrics = merged
    if not brief.findings:
        brief.findings = stub.findings
    if not brief.risks:
        brief.risks = stub.risks
    return brief
