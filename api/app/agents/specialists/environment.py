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
    climate = env.get("climate") or ctx.get("climate") or {}
    climate_source = climate.get("source") or "benchmark"
    mx = ctx.get("matrix_summary") or {}

    climate_note = (
        f"Local heat-wave peak {env.get('heatwave_peak_c')} C "
        f"({climate.get('provider') or 'climate'}, {climate_source})."
        if climate
        else f"Stress peak outdoor temperature {env.get('heatwave_peak_c')} C "
        "(documented Toronto heat-wave event)."
    )

    findings = [
        climate_note,
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
            climate_note,
            f"Heat-wave peaks: A {a.get('peak_kw')} kW ({a.get('strain_class')}) vs "
            f"B {b.get('peak_kw')} kW ({b.get('strain_class')}).",
            f"Flips vs heat-wave baseline: {mx.get('flip_scenarios') or 'none'}.",
        ]
    if live.get("carbon_intensity") is not None:
        findings.append(
            f"Live Electricity Maps intensity ({live.get('zone')}): "
            f"{live['carbon_intensity']} gCO2e/kWh ({live_source})."
        )

    risks = [
        "Grid strain classes are published-factor proxies, not utility telemetry.",
    ]
    if mx or climate:
        risks.append(
            "Extreme weekends from climate archive or Toronto benchmarks — "
            "not a full 8760h weather year."
        )
    if live_source != "live":
        risks.append("Live grid intensity unavailable; carbon uses TAF benchmarks.")

    heat_status = "live" if climate_source == "live" else "benchmark"
    stub = AgentBrief(
        agent_id="environment",
        title="Environment / grid",
        findings=findings[:4],
        metrics={
            "heatwave_peak_c": env.get("heatwave_peak_c"),
            "climate_source": climate_source,
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
            src(
                "Local extreme weekend temperatures",
                heat_status,
                climate.get("url") or env.get("heatwave_source"),
            ),
            src(
                f"Electricity Maps {live.get('zone') or 'CA-ON'}",
                live_source,
                live.get("url"),
            ),
        ],
        confidence=0.75 if climate_source == "live" and live_source == "live" else 0.65,
    )
    focus = (
        "Year-pack peaks, location climate extremes, and grid carbon."
        if mx
        else "Heat stress, peak kW, and grid carbon intensity under peak vs average."
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
            "climate": climate or None,
        },
        stub=stub,
    )
