"use client";

import { LogGlyph } from "@/components/component-icons";
import type { LogEntry } from "@/lib/build-config";

interface PhysicsLogProps {
  entries: LogEntry[];
  runtimeLines: string[];
}

export function PhysicsLog({ entries, runtimeLines }: PhysicsLogProps) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-panel-border bg-panel">
      <div className="border-b border-panel-border px-4 py-3">
        <h2 className="text-[15px] font-semibold">Physics &amp; Structure Log</h2>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {entries.map((entry, i) => (
          <div key={i} className="border-b border-panel-border pb-3">
            <p
              className={`text-[12px] leading-snug ${
                entry.kind === "warning"
                  ? "font-medium text-[#A35A52]"
                  : "text-text-strong"
              }`}
            >
              {entry.kind === "warning" ? "Warning: " : ""}
              {entry.text}
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-text-soft">
              <LogGlyph icon={entry.icon} />
              <LogGlyph icon={entry.kind === "warning" ? "shear" : "bolt"} />
            </div>
          </div>
        ))}
        {runtimeLines.length > 0 && (
          <div className="pt-1">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-soft">
              Engine
            </p>
            {runtimeLines.map((line, i) => (
              <p
                key={i}
                className="border-b border-panel-border pb-2 pt-1 text-[11.5px] leading-snug text-text-soft"
              >
                {line}
              </p>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
