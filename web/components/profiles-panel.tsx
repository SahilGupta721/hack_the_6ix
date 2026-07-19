"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { LoadChart } from "@/components/load-chart";
import { fetchProfiles } from "@/lib/api";
import type { BuildingType, LoadProfileInfo } from "@/lib/types";

// Illustrative office comparator: the classic smooth single-arch commercial
// load shape (LBNL small/medium commercial load-shape benchmarking), mean 1.0.
const OFFICE_ARCH: number[] = [
  0.55, 0.53, 0.52, 0.52, 0.54, 0.6,
  0.75, 0.95, 1.18, 1.32, 1.4, 1.43,
  1.44, 1.43, 1.4, 1.35, 1.25, 1.1,
  0.95, 0.82, 0.72, 0.65, 0.6, 0.57,
];

interface ProfilesPanelProps {
  buildingType: BuildingType;
  onClose: () => void;
}

export function ProfilesPanel({ buildingType, onClose }: ProfilesPanelProps) {
  const [profiles, setProfiles] = useState<Record<string, LoadProfileInfo> | null>(
    null,
  );
  const [selected, setSelected] = useState<BuildingType>(buildingType);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfiles()
      .then(setProfiles)
      .catch(() => setError("Profile service unavailable"));
  }, []);

  const profile = profiles?.[selected];

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex flex-col bg-[#0c1812]/60 backdrop-blur-[2px]">
      <div className="flex items-start justify-between border-b border-panel-border bg-panel px-5 py-3">
        <div>
          <h2 className="text-[19px] font-semibold text-text-strong">
            Energy Load Profiles
          </h2>
          <p className="text-[12px] text-text-soft">
            Our hospitality benchmarking engine: occupancy-driven shapes, not
            generic commercial curves. Every constant sourced in the memo
            footnotes.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded border border-panel-border px-3 py-1.5 text-[12px] font-semibold hover:bg-panel-muted"
        >
          Close
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <LoadChart
              title="Generic Commercial Office Load (Smooth Arch)"
              colour="#e4d659"
              series={OFFICE_ARCH.map((kw, hour) => ({ hour, kw }))}
              height={230}
            />
            {profile ? (
              <LoadChart
                title={`INN-SIGHT Hospitality Load (${
                  profile.character === "spiky"
                    ? "Spiky, Occupancy-Driven"
                    : profile.character === "cyclical"
                      ? "Spiky, Cyclical"
                      : "Smooth, Base-Load Heavy"
                })`}
                colour="#e4d659"
                series={profile.hourly_shape.map((kw, hour) => ({ hour, kw }))}
                height={230}
              />
            ) : (
              <div className="grid place-items-center rounded border border-[#2a4438] bg-chart-navy text-[12px] text-white/60">
                {error ?? "Loading profile..."}
              </div>
            )}
          </div>

          <div className="rounded border border-[#2a4438] bg-chart-navy p-3">
            <p className="mb-2 text-[12px] font-semibold text-white/90">
              Validation: our generated curve vs a published metered hotel
            </p>
            <Image
              src="/validation.png"
              alt="Generated tower load curve overlaid on the metered full-service hotel curve from Placet et al. 2010; both trough overnight at 45-70 percent of peak"
              width={1290}
              height={690}
              className="h-auto w-full max-w-3xl rounded"
              unoptimized
            />
            <p className="mt-2 max-w-3xl text-[10.5px] leading-snug text-white/50">
              Published curve: Placet et al. 2010, ACEEE Summer Study, metered
              300-room full-service hotel (approximate trace of Figure 2; base
              400 kW and peak cooling 200 kW are text-stated). Our night trough
              lands inside the published 44-67 percent band. Office comparator:
              LBNL commercial load-shape benchmarking, illustrative.
            </p>
          </div>
        </div>

        <aside className="w-64 shrink-0 border-l border-panel-border bg-panel p-4">
          <h3 className="text-[14px] font-semibold">Energy Load Profiles</h3>
          <p className="mt-2 text-[11px] text-text-soft">Selected profile:</p>
          <div className="mt-1.5 space-y-1.5 rounded-md border-2 border-mint/50 p-2.5">
            {profiles &&
              (Object.keys(profiles) as BuildingType[]).map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 text-[12px]"
                >
                  <input
                    type="radio"
                    name="profile"
                    checked={selected === key}
                    onChange={() => setSelected(key)}
                    className="accent-mint"
                  />
                  {profiles[key].label}
                </label>
              ))}
          </div>
          {profile && (
            <p className="mt-3 text-[11px] leading-snug text-text-soft">
              Character: {profile.character}. Normalized 24-hour shape, mean
              1.0; the stress engine scales it by occupancy, base-load share,
              and weather.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
