from __future__ import annotations

from typing import Any

from app.agents.llm import LLMProvider
from app.agents.schemas import AgentBrief
from app.agents.specialists import run_specialist, src


def analyze_friction(provider: LLMProvider, ctx: dict[str, Any]) -> AgentBrief:
    fr = ctx.get("friction") or {}
    a = fr.get("option_a") or {}
    b = fr.get("option_b") or {}
    terms_a = a.get("terms") or {}
    terms_b = b.get("terms") or {}
    mx = ctx.get("matrix_summary") or {}

    findings = [
        f"Community friction (heuristic 1-10): A {a.get('score')} vs B {b.get('score')}.",
        f"A terms — traffic {terms_a.get('traffic')}, noise {terms_a.get('noise')}, "
        f"housing {terms_a.get('housing')}, grid {terms_a.get('grid')}.",
        f"B terms — traffic {terms_b.get('traffic')}, noise {terms_b.get('noise')}, "
        f"housing {terms_b.get('housing')}, grid {terms_b.get('grid')}.",
        "Higher scores mean more neighbourhood friction; grid term tracks peak strain.",
    ]
    if mx.get("worst_peak_scenario"):
        findings.append(
            f"Year pack: grid friction pressure highest in "
            f"{mx.get('worst_peak_scenario')} (heuristic follows peak strain)."
        )

    stub = AgentBrief(
        agent_id="friction",
        title="Community friction",
        findings=findings[:4],
        metrics={
            "score_a": a.get("score"),
            "score_b": b.get("score"),
            "terms_a": terms_a,
            "terms_b": terms_b,
        },
        risks=[
            fr.get("label")
            or "Documented heuristic, not survey data (model/friction.md).",
        ],
        sources=[
            src("Community friction heuristic", "heuristic", None),
        ],
        confidence=0.5,
    )
    # Attach formula note in metrics
    stub.metrics["formula"] = fr.get("formula")
    return run_specialist(
        provider,
        agent_id="friction",
        title="Community friction",
        focus=(
            "Interpret friction across the year-pack peak matrix; grid term follows strain."
            if mx
            else "Interpret the documented friction heuristic for Options A and B."
        ),
        context={"friction": fr, "matrix_summary": mx or None},
        stub=stub,
    )
