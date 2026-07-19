"use client";

import type { AgentBrief, BossSynthesis } from "@/lib/types";

interface AgentBriefingPanelProps {
  briefs: Record<string, AgentBrief>;
  synthesis: BossSynthesis;
  generator: string;
  fallbackReason?: string | null;
}

const ORDER = [
  "market",
  "environment",
  "neighborhood",
  "green_ratio",
  "friction",
  "compliance",
];

export function AgentBriefingPanel({
  briefs,
  synthesis,
  generator,
  fallbackReason,
}: AgentBriefingPanelProps) {
  const ordered = ORDER.map((id) => briefs[id]).filter(Boolean);

  return (
    <div className="mb-2.5 max-h-[36%] min-h-0 overflow-y-auto rounded border border-white/15 bg-white/5 px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
          Multi-agent briefing
        </p>
        <span className="rounded bg-white/10 px-1.5 py-px text-[9px] font-bold uppercase text-white/70">
          {generator}
        </span>
      </div>
      {fallbackReason && (
        <p className="mb-2 text-[10px] leading-snug text-amber/90">
          Gemini unavailable: {fallbackReason}
        </p>
      )}

      <p className="mb-2 text-[12px] leading-snug text-white/90">
        {synthesis.summary}
      </p>

      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <ImpactBlock
          title="Environmental"
          items={synthesis.environmental_impact}
        />
        <ImpactBlock title="Business" items={synthesis.business_impact} />
      </div>

      <p className="mb-2 text-[11px] leading-snug text-white/75">
        {synthesis.recommendation_alignment}
        {synthesis.reinforces_sim
          ? " Specialists reinforce the sim pick."
          : " Specialists challenge the sim pick; review open questions."}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {ordered.map((brief) => (
          <AgentChip key={brief.agent_id} brief={brief} />
        ))}
      </div>

      {synthesis.open_questions.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[10px] text-white/55">
          {synthesis.open_questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImpactBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-mint/80">
        {title}
      </p>
      <ul className="space-y-0.5 text-[11px] leading-snug text-white/80">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function AgentChip({ brief }: { brief: AgentBrief }) {
  const status = brief.sources[0]?.status ?? "estimate";
  const tallies = brief.metrics?.tallies as
    | { fail?: number; warn?: number }
    | undefined;
  const hot =
    brief.agent_id === "compliance" &&
    ((tallies?.fail ?? 0) > 0 || (tallies?.warn ?? 0) > 0);

  return (
    <details className="group max-w-full rounded border border-white/10 bg-black/20 px-2 py-1">
      <summary className="cursor-pointer list-none text-[11px] font-medium text-white/90">
        {brief.title}
        <span className="ml-1.5 text-[9px] uppercase text-white/45">
          {status} · {Math.round(brief.confidence * 100)}%
          {hot ? " · review" : ""}
        </span>
      </summary>
      <ul className="mt-1 space-y-0.5 border-t border-white/10 pt-1 text-[10px] leading-snug text-white/70">
        {brief.findings.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {brief.risks.length > 0 && (
        <p className="mt-1 text-[9px] text-amber/80">{brief.risks[0]}</p>
      )}
    </details>
  );
}
