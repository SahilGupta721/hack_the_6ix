from __future__ import annotations

from typing import Any

from app.agents.llm import LLMProvider
from app.agents.schemas import AgentBrief
from app.agents.specialists import run_specialist, src


def analyze_environment(provider: LLMProvider, ctx: dict[str, Any]) -> AgentBrief:
    env = ctx.get("environment") or {}
    cmp_ = ctx.get("comparison") or {}
    a = cmp_.get("option_a") or {}
    b = cmp_.get("option_b") or {}
    live = env.get("live_grid") or {}
    live_source = live.get("source") or "benchmark"
    mx = ctx.get("matrix_summary") or {}

    findings = [
        f"Stress scenario peak outdoor temperature {env.get('heatwave_peak_c')} C "
        f"(documented Toronto heat-wave event).",
        f"Peak grid strain: A {a.get('strain_class')} ({a.get('peak_kw')} kW) vs "
        f"B {b.get('strain_class')} ({b.get('peak_kw')} kW).",
        f"Ontario grid planning intensity avg {env.get('grid_intensity_avg_g_per_kwh')} "
        f"gCO2e/kWh; summer on-peak marginal "
        f"{env.get('grid_intensity_peak_g_per_kwh')} gCO2e/kWh (TAF).",
    ]
    if mx:
        findings = [
            f"Year pack worst peak scenario: {mx.get('worst_peak_scenario')}; "
            f"coldest HP stress: {mx.get('coldest_hp_stress_scenario')}.",
            f"Heat-wave peaks: A {a.get('peak_kw')} kW ({a.get('strain_class')}) vs "
            f"B {b.get('peak_kw')} kW ({b.get('strain_class')}).",
            f"Flips vs heat-wave baseline: {mx.get('flip_scenarios') or 'none'}.",
            f"Ontario grid avg {env.get('grid_intensity_avg_g_per_kwh')} gCO2e/kWh (TAF).",
        ]
    if live.get("carbon_intensity") is not None:
        findings.append(
            f"Live Electricity Maps Ontario intensity: "
            f"{live['carbon_intensity']} gCO2e/kWh ({live_source})."
        )

    risks = [
        "Grid strain classes are published-factor proxies, not utility telemetry.",
    ]
    if mx:
        risks.append("Year pack is five extreme weekends, not 8760h weather.")
    if live_source != "live":
        risks.append("Live grid intensity unavailable; carbon uses TAF benchmarks.")

    stub = AgentBrief(
        agent_id="environment",
        title="Environment / grid",
        findings=findings[:4],
        metrics={
            "heatwave_peak_c": env.get("heatwave_peak_c"),
            "grid_avg_g_per_kwh": env.get("grid_intensity_avg_g_per_kwh"),
            "grid_peak_g_per_kwh": env.get("grid_intensity_peak_g_per_kwh"),
            "live_carbon_intensity": live.get("carbon_intensity"),
            "peak_kw_a": a.get("peak_kw"),
            "peak_kw_b": b.get("peak_kw"),
            "strain_a": a.get("strain_class"),
            "strain_b": b.get("strain_class"),
            "worst_peak_scenario": mx.get("worst_peak_scenario"),
            "coldest_hp_stress_scenario": mx.get("coldest_hp_stress_scenario"),
        },
        risks=risks,
        sources=[
            src("TAF Ontario emissions factors", "benchmark", env.get("grid_avg_source")),
            src("Heat-wave peak temperature", "benchmark", env.get("heatwave_source")),
            src("Electricity Maps CA-ON", live_source, live.get("url")),
        ],
        confidence=0.7 if live_source == "live" else 0.65,
    )
    focus = (
        "Year-pack peaks, strain flips, and grid carbon across extreme weekends."
        if mx
        else "Heat-wave stress, peak kW, and grid carbon intensity under peak vs average."
    )
    return run_specialist(
        provider,
        agent_id="environment",
        title="Environment / grid",
        focus=focus,
        context={
            "environment": env,
            "comparison": cmp_,
            "matrix_summary": mx or None,
        },
        stub=stub,
    )
