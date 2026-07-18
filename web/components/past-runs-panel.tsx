"use client";

import { useEffect, useState } from "react";
import { fetchMyRuns, type PastRun } from "@/lib/api";
import { scenarioLabel } from "@/lib/scenarios";

interface PastRunsPanelProps {
  auth0Sub: string | null;
  loggedIn: boolean;
  onClose: () => void;
}

export function PastRunsPanel({
  auth0Sub,
  loggedIn,
  onClose,
}: PastRunsPanelProps) {
  const [runs, setRuns] = useState<PastRun[]>([]);
  const [available, setAvailable] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!loggedIn || !auth0Sub) return;
    setLoading(true);
    fetchMyRuns(auth0Sub)
      .then((res) => {
        setAvailable(res.available);
        setRuns(res.runs);
        setNote(res.note ?? null);
      })
      .catch(() => {
        setAvailable(false);
        setNote("Could not load run history.");
      })
      .finally(() => setLoading(false));
  }, [auth0Sub, loggedIn]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 overflow-y-auto bg-[#0b1420]/85 p-5 backdrop-blur-sm">
      <div className="mx-auto max-w-2xl rounded-lg bg-panel p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold">Past runs</h2>
            <p className="mt-1 text-[11px] leading-snug text-text-soft">
              Saved stress tests for your account. Sim numbers are deterministic;
              LLM narrative generators are labelled for transparency.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-panel-border px-3 py-1.5 text-[12px] font-semibold hover:bg-panel-muted"
          >
            Close
          </button>
        </div>

        {!loggedIn && (
          <p className="rounded border border-panel-border bg-panel-muted px-3 py-3 text-[12px] text-text-soft">
            Sign in to save and view past runs on your account.
          </p>
        )}

        {loggedIn && loading && (
          <p className="text-[12px] text-text-soft">Loading history...</p>
        )}

        {loggedIn && !loading && !available && (
          <p className="rounded border border-panel-border bg-panel-muted px-3 py-3 text-[12px] text-text-soft">
            {note ?? "Run history unavailable (MongoDB not configured)."}
          </p>
        )}

        {loggedIn && !loading && available && runs.length === 0 && (
          <p className="rounded border border-panel-border bg-panel-muted px-3 py-3 text-[12px] text-text-soft">
            No saved runs yet. Run a stress test while signed in to build history.
          </p>
        )}

        {loggedIn && !loading && runs.length > 0 && (
          <ul className="space-y-2">
            {runs.map((run) => (
              <li
                key={run.id}
                className="rounded border border-panel-border bg-white px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[12.5px] font-semibold">
                      {scenarioLabel(run.scenario)} · Option {run.recommended}
                    </p>
                    <p className="text-[11px] text-text-soft">
                      {run.rooms}-room {run.building_type}
                      {run.ts ? ` · ${formatTs(run.ts)}` : ""}
                    </p>
                  </div>
                  <span className="rounded bg-panel-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-text-soft">
                    {run.kind}
                  </span>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-snug text-text-soft">
                  Generators: memo{" "}
                  <span className="font-semibold text-text-strong">
                    {run.narrative_generator ?? "n/a"}
                  </span>
                  {run.briefing_generator
                    ? ` · agents ${run.briefing_generator}`
                    : ""}
                  {(run.fallback_reason || run.briefing_fallback_reason) && (
                    <>
                      {" "}
                      · fallback{" "}
                      {run.fallback_reason || run.briefing_fallback_reason}
                    </>
                  )}
                </p>
                {run.abatement_cost != null && (
                  <p className="mt-0.5 text-[10.5px] text-text-soft">
                    Abatement ${Math.round(run.abatement_cost)}/tCO2e · ΔtCO2e{" "}
                    {run.tco2e_delta?.toFixed?.(1) ?? run.tco2e_delta}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 border-t border-panel-border pt-3 text-[10px] leading-snug text-text-soft">
          Responsible AI: figures come from the deterministic engine; Gemini (or
          fallback) only narrates over those figures. Stay22 listings are never
          stored. Production should verify Auth0 JWTs on this endpoint.
        </p>
      </div>
    </div>
  );
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
