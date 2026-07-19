"use client";

import { useEffect, useState } from "react";
import {
  fetchMyRuns,
  fetchRun,
  type PastRun,
  type PastRunDetail,
} from "@/lib/api";
import { scenarioLabel } from "@/lib/scenarios";

interface PastRunsPanelProps {
  auth0Sub: string | null;
  loggedIn: boolean;
  onClose: () => void;
  onOpenRun: (detail: PastRunDetail) => void;
}

export function PastRunsPanel({
  auth0Sub,
  loggedIn,
  onClose,
  onOpenRun,
}: PastRunsPanelProps) {
  const [runs, setRuns] = useState<PastRun[]>([]);
  const [available, setAvailable] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

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

  async function handleOpen(run: PastRun) {
    if (!auth0Sub || openingId) return;
    setOpenError(null);
    setOpeningId(run.id);
    try {
      const detail = await fetchRun(run.id, auth0Sub);
      if (!detail.report) {
        setOpenError(
          "This run has no reopenable report (saved before report persistence). Re-run year stress while signed in to store one.",
        );
        return;
      }
      onOpenRun(detail);
    } catch {
      setOpenError("Could not open that run. Is the API running on port 8000?");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 overflow-y-auto bg-[#0b1420]/85 p-5 backdrop-blur-sm">
      <div className="mx-auto max-w-2xl rounded-lg bg-panel p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold">Past runs</h2>
            <p className="mt-1 text-[11px] leading-snug text-text-soft">
              Click a row to reopen the saved year-pack briefing and memo.
              Rows marked metadata-only cannot be reopened.
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

        {openError && (
          <p className="mb-2 rounded border border-amber-300/60 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            {openError}
          </p>
        )}

        {loggedIn && !loading && runs.length > 0 && (
          <ul className="space-y-2">
            {runs.map((run) => {
              const canOpen = run.has_report !== false && Boolean(run.has_report);
              const isOpening = openingId === run.id;
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    disabled={Boolean(openingId)}
                    onClick={() => void handleOpen(run)}
                    className="flex w-full cursor-pointer items-start justify-between gap-3 rounded border border-panel-border bg-white px-3 py-2.5 text-left transition hover:border-ink/35 hover:bg-[#f3faf6] disabled:cursor-wait"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold">
                        {scenarioLabel(run.scenario)} · Option {run.recommended}
                      </p>
                      <p className="text-[11px] text-text-soft">
                        {run.rooms}-room {run.building_type}
                        {run.ts ? ` · ${formatTs(run.ts)}` : ""}
                      </p>
                      <p className="mt-1.5 text-[10.5px] leading-snug text-text-soft">
                        Generators: memo{" "}
                        <span className="font-semibold text-text-strong">
                          {run.narrative_generator ?? "n/a"}
                        </span>
                        {run.briefing_generator
                          ? ` · agents ${run.briefing_generator}`
                          : ""}
                        {(run.fallback_reason ||
                          run.briefing_fallback_reason) && (
                          <>
                            {" "}
                            · fallback{" "}
                            {run.fallback_reason ||
                              run.briefing_fallback_reason}
                          </>
                        )}
                      </p>
                      {run.abatement_cost != null && (
                        <p className="mt-0.5 text-[10.5px] text-text-soft">
                          Abatement ${Math.round(run.abatement_cost)}/tCO2e ·
                          ΔtCO2e{" "}
                          {run.tco2e_delta?.toFixed?.(1) ?? run.tco2e_delta}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="rounded bg-panel-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-text-soft">
                        {run.kind}
                      </span>
                      <span
                        className={`rounded px-2 py-1 text-[10px] font-semibold ${
                          canOpen
                            ? "bg-[#0d7a55] text-white"
                            : "bg-panel-muted text-text-soft"
                        }`}
                      >
                        {isOpening
                          ? "Opening…"
                          : canOpen
                            ? "Open report →"
                            : "Metadata only"}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
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
