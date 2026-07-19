"use client";

import type { ComplianceCheck, ComplianceTallies } from "@/lib/types";

interface CompliancePanelProps {
  checks: ComplianceCheck[];
  tallies?: ComplianceTallies | null;
  jurisdiction?: string | null;
  zoningDistrict?: string | null;
  disclaimer?: string | null;
}

const STATUS_STYLE: Record<
  ComplianceCheck["status"],
  { label: string; className: string }
> = {
  pass: { label: "Pass", className: "text-[#6ee7b7] bg-[#0d7a55]/25" },
  warn: { label: "Watch", className: "text-amber bg-amber/15" },
  fail: { label: "Over", className: "text-[#fda4af] bg-[#b3261e]/30" },
  info: { label: "Info", className: "text-white/70 bg-white/10" },
};

export function CompliancePanel({
  checks,
  tallies,
  jurisdiction,
  zoningDistrict,
  disclaimer,
}: CompliancePanelProps) {
  if (!checks.length) return null;

  const measured = checks.filter((c) => c.status !== "info" || c.model != null);
  const rows = measured.length ? measured : checks;

  return (
    <div className="mt-2 rounded border border-white/15 bg-black/25 px-2.5 py-2">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
            Rules & compliance
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-white/50">
            {jurisdiction || "Local jurisdiction pack"}
            {zoningDistrict ? ` · ${zoningDistrict}` : ""}
            {" — model vs clause (not a permit gate)."}
          </p>
        </div>
        {tallies && (
          <div className="flex flex-wrap gap-1">
            {(["fail", "warn", "pass", "info"] as const).map((key) => {
              const n = tallies[key] ?? 0;
              if (!n) return null;
              const style = STATUS_STYLE[key];
              return (
                <span
                  key={key}
                  className={`rounded px-1.5 py-px text-[9px] font-semibold uppercase ${style.className}`}
                >
                  {n} {style.label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-[10px]">
          <thead>
            <tr className="border-b border-white/10 text-white/45">
              <th className="px-1.5 py-1 font-medium">Constraint</th>
              <th className="px-1.5 py-1 font-medium">Your model</th>
              <th className="px-1.5 py-1 font-medium">Rule / clause</th>
              <th className="px-1.5 py-1 font-medium">Δ</th>
              <th className="px-1.5 py-1 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const style = STATUS_STYLE[c.status] ?? STATUS_STYLE.info;
              return (
                <tr
                  key={c.id}
                  className="border-b border-white/5 align-top text-white/80"
                >
                  <td className="px-1.5 py-1.5">
                    <span className="font-medium text-white/90">{c.rule}</span>
                    {c.applies_to && c.applies_to !== "both" && (
                      <span className="mt-0.5 block text-[9px] text-white/40">
                        Option {c.applies_to}
                      </span>
                    )}
                  </td>
                  <td className="px-1.5 py-1.5 font-medium text-white/90">
                    {c.model_display}
                  </td>
                  <td className="px-1.5 py-1.5 leading-snug text-white/55">
                    {c.clause}
                  </td>
                  <td className="px-1.5 py-1.5 whitespace-nowrap text-white/70">
                    {c.delta_display}
                  </td>
                  <td className="px-1.5 py-1.5">
                    <span
                      className={`rounded px-1.5 py-px text-[9px] font-bold uppercase ${style.className}`}
                    >
                      {style.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {disclaimer && (
        <p className="mt-1.5 text-[9px] leading-snug text-white/40">{disclaimer}</p>
      )}
    </div>
  );
}

/** Pull structured engine rows from the compliance specialist metrics. */
export function checksFromBrief(metrics: Record<string, unknown> | undefined): {
  checks: ComplianceCheck[];
  tallies: ComplianceTallies | null;
  jurisdiction: string | null;
  zoningDistrict: string | null;
  disclaimer: string | null;
} {
  const raw = metrics?.checks;
  const checks = Array.isArray(raw)
    ? (raw as ComplianceCheck[]).filter(
        (c) => c && typeof c.rule === "string" && typeof c.clause === "string",
      )
    : [];
  const tallies =
    metrics?.tallies && typeof metrics.tallies === "object"
      ? (metrics.tallies as ComplianceTallies)
      : null;
  return {
    checks,
    tallies,
    jurisdiction:
      typeof metrics?.jurisdiction === "string" ? metrics.jurisdiction : null,
    zoningDistrict:
      typeof metrics?.zoning_district === "string"
        ? metrics.zoning_district
        : null,
    disclaimer:
      typeof metrics?.disclaimer === "string" ? metrics.disclaimer : null,
  };
}
