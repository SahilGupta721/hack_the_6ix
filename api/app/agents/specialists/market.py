from __future__ import annotations

from typing import Any

from app.agents.llm import LLMProvider
from app.agents.schemas import AgentBrief
from app.agents.specialists import run_specialist, src


def analyze_market(provider: LLMProvider, ctx: dict[str, Any]) -> AgentBrief:
    market = ctx.get("market") or {}
    target = market.get("target") or {}
    baseline = market.get("baseline") or {}
    ratio = market.get("demand_ratio")
    source = market.get("source") or "estimate"

    findings = []
    if target.get("median_rate") is not None:
        findings.append(
            f"Near-term median ADR ${target['median_rate']:.0f}/night "
            f"across {target.get('priced', 0)} priced listings within 3 km "
            f"(check-in {market.get('checkin')})."
        )
    else:
        findings.append("No priced Stay22 listings available for the target weekend.")
    if ratio is not None and baseline.get("median_rate") is not None:
        pct = round((ratio - 1) * 100)
        if ratio >= 1.05:
            findings.append(
                f"Target weekend prices ~{pct}% above the shoulder weekend "
                f"(${baseline['median_rate']:.0f}); market is pricing peak demand."
            )
        else:
            findings.append(
                "Little or no demand premium vs the shoulder weekend four weeks out."
            )
    findings.append(
        "Fully booked heat-wave stress assumes the occupancy the market is "
        "already signalling on forward dates."
    )
    if ctx.get("matrix_summary"):
        findings.append(
            "Year pack reuses one Stay22 pull across all five extreme weekends."
        )

    risks = []
    if source != "live":
        risks.append(f"Market source is {source}; treat rates as provisional.")
    if not target.get("priced"):
        risks.append("Sparse priced sample; ADR signal may be weak.")

    stub = AgentBrief(
        agent_id="market",
        title="Market (Stay22)",
        findings=findings[:4],
        metrics={
            "median_rate_cad": target.get("median_rate"),
            "baseline_median_cad": baseline.get("median_rate"),
            "demand_ratio": ratio,
            "priced_listings": target.get("priced"),
            "checkin": market.get("checkin"),
        },
        risks=risks,
        sources=[
            src("Stay22 Direct Travel API (demo mode)", source),
        ],
        confidence=0.75 if source == "live" and target.get("priced") else 0.4,
    )
    return run_specialist(
        provider,
        agent_id="market",
        title="Market (Stay22)",
        focus=(
            "ADR and demand premium; note shared market context for the year pack."
            if ctx.get("matrix_summary")
            else "ADR, demand premium vs shoulder weekend, occupancy implication for the stress case."
        ),
        context={
            "market": market,
            "comparison": ctx.get("comparison"),
            "matrix_summary": ctx.get("matrix_summary"),
        },
        stub=stub,
    )
