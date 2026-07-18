from __future__ import annotations

from typing import Any

from app.agents.llm import LLMProvider
from app.agents.schemas import AgentBrief
from app.agents.specialists import run_specialist, src


def analyze_green_ratio(provider: LLMProvider, ctx: dict[str, Any]) -> AgentBrief:
    gr = ctx.get("green_ratio") or {}
    cmp_ = ctx.get("comparison") or {}
    a_vs = gr.get("option_a_vs_proxy")
    b_vs = gr.get("option_b_vs_proxy")

    findings = [
        f"Option A {gr.get('option_a_tco2e_per_room')} tCO2e/room-yr vs "
        f"Option B {gr.get('option_b_tco2e_per_room')} "
        f"(sim totals including amortized embodied).",
        f"Neighborhood hospitality proxy ~{gr.get('neighborhood_proxy_tco2e_per_room_yr')} "
        f"tCO2e/room-yr ({gr.get('proxy_status')}).",
    ]
    if a_vs is not None and b_vs is not None:
        findings.append(
            f"Relative to that proxy: A is {a_vs}x and B is {b_vs}x "
            f"— lower is greener vs nearby stock."
        )
    findings.append(
        f"Embodied amortized: A {gr.get('embodied_a')} vs B {gr.get('embodied_b')} tCO2e/yr."
    )

    stub = AgentBrief(
        agent_id="green_ratio",
        title="Relative green ratio",
        findings=findings[:4],
        metrics={
            "proxy_tco2e_per_room_yr": gr.get("neighborhood_proxy_tco2e_per_room_yr"),
            "a_per_room": gr.get("option_a_tco2e_per_room"),
            "b_per_room": gr.get("option_b_tco2e_per_room"),
            "a_vs_proxy": a_vs,
            "b_vs_proxy": b_vs,
            "sim_tco2e_delta": cmp_.get("tco2e_delta"),
        },
        risks=[
            gr.get("proxy_note")
            or "Neighborhood green ratio uses an estimated proxy, not metered peers.",
        ],
        sources=[
            src("Deterministic sim tCO2e", "benchmark"),
            src("Neighborhood hospitality carbon proxy", "estimate"),
        ],
        confidence=0.6,
    )
    return run_specialist(
        provider,
        agent_id="green_ratio",
        title="Relative green ratio",
        focus=(
            "Relative greenness of A vs B; annual tCO2e is scenario-stable across the year pack."
            if ctx.get("matrix_summary")
            else "How green A vs B is relative to a neighborhood hospitality carbon proxy."
        ),
        context={
            "green_ratio": gr,
            "comparison": cmp_,
            "matrix_summary": ctx.get("matrix_summary"),
        },
        stub=stub,
    )
