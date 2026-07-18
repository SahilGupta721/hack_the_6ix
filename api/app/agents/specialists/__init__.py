"""Shared helpers for specialist agents."""

from __future__ import annotations

from typing import Any

from app.agents.llm import DeterministicFallbackProvider, LLMProvider, dumps_context
from app.agents.schemas import AgentBrief, SourceRef


SYSTEM_PREAMBLE = (
    "You are a specialist analyst for INN-SIGHT, a Toronto hospitality "
    "development stress-test tool. Use ONLY numbers and facts in the provided "
    "JSON context. Never invent figures. Canadian spelling. No em dashes. "
    "Label uncertainty honestly. Keep findings to 2-4 short bullets."
)


def run_specialist(
    provider: LLMProvider,
    *,
    agent_id: str,
    title: str,
    focus: str,
    context: dict[str, Any],
    stub: AgentBrief,
) -> AgentBrief:
    if isinstance(provider, DeterministicFallbackProvider):
        return stub

    try:
        system = f"{SYSTEM_PREAMBLE}\nYour focus: {focus}"
        user = (
            f"Produce an AgentBrief JSON for agent_id={agent_id!r} title={title!r}. "
            f"Set confidence between 0 and 1. Include source status labels "
            f"(live/cached/benchmark/heuristic/estimate).\n\nContext:\n"
            f"{dumps_context(context)}"
        )
        from app.agents.ai_energy import call_label

        with call_label(agent_id):
            result = provider.complete_json(system, user, AgentBrief)
        brief = AgentBrief.model_validate(result.model_dump())
        brief.agent_id = agent_id
        brief.title = title
        return brief
    except Exception:
        return stub


def src(label: str, status: str, url: str | None = None) -> SourceRef:
    return SourceRef(label=label, status=status, url=url)  # type: ignore[arg-type]
