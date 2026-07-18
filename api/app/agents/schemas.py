"""Shared contracts for specialist briefs and boss synthesis."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

SourceStatus = Literal["live", "cached", "benchmark", "heuristic", "estimate"]


class SourceRef(BaseModel):
    label: str
    status: SourceStatus
    url: str | None = None


class AgentBrief(BaseModel):
    agent_id: str
    title: str
    findings: list[str] = Field(default_factory=list)
    metrics: dict[str, Any] = Field(default_factory=dict)
    risks: list[str] = Field(default_factory=list)
    sources: list[SourceRef] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)


class BossSynthesis(BaseModel):
    environmental_impact: list[str] = Field(default_factory=list)
    business_impact: list[str] = Field(default_factory=list)
    recommendation_alignment: str = ""
    reinforces_sim: bool = True
    open_questions: list[str] = Field(default_factory=list)
    summary: str = ""


class BriefingResponse(BaseModel):
    comparison: dict[str, Any]
    briefs: dict[str, AgentBrief]
    synthesis: BossSynthesis
    generator: str
    fallback_reason: str | None = None


class YearBriefingResponse(BaseModel):
    """Multi-scenario year pack: matrix + shared agents + portfolio memo."""

    scenarios: dict[str, dict[str, Any]]
    matrix_summary: dict[str, Any]
    briefs: dict[str, AgentBrief]
    synthesis: BossSynthesis
    memo: dict[str, Any]
    generator: str
    fallback_reason: str | None = None
    # Primary comparison (heat-wave) for clients that still expect one A/B view.
    comparison: dict[str, Any]
    climate: dict[str, Any] | None = None
