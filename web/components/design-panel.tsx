"use client";

import { useState } from "react";
import { ComponentIcon, TypeIcon } from "@/components/component-icons";
import type { AreaBrief } from "@/components/area-brief-panel";
import {
  COMPONENT_LABELS,
  type BuildComponents,
} from "@/lib/build-config";
import {
  SHAPE_IDS,
  avgRoomsPerStorey,
  getShape,
  storeysRange,
  type ShapeId,
} from "@/lib/building-shape";
import type { OptionKey } from "@/lib/types";

export type UiBuildingType = "hotel" | "homestay" | "bnb";

export const UI_TYPES: {
  key: UiBuildingType;
  label: string;
  rooms: number;
  blurb: string;
}[] = [
  { key: "hotel", label: "Hotel", rooms: 40, blurb: "40 rooms, full service" },
  { key: "homestay", label: "Homestay", rooms: 6, blurb: "6 rooms, hosted" },
  { key: "bnb", label: "B&B", rooms: 10, blurb: "10 rooms, breakfast" },
];

const COMPONENT_SECTIONS: {
  title: string;
  field: keyof BuildComponents;
  options: string[];
}[] = [
  {
    title: "Foundation",
    field: "foundation",
    options: ["reinforced_concrete", "precast_piles"],
  },
  {
    title: "Main Structure",
    field: "mainStructure",
    options: ["timber", "steel_brace"],
  },
  {
    title: "Floor structure",
    field: "floors",
    options: ["mass_timber", "hollow_core"],
  },
  {
    title: "Facade",
    field: "facade",
    options: ["curtain_wall", "rainscreen"],
  },
  {
    title: "Energy Systems",
    field: "energy",
    options: ["heat_pump", "central_plant"],
  },
];

interface DesignPanelProps {
  placed: boolean;
  siteName: string;
  /** False until a green OSM parcel is selected. */
  canPlace?: boolean;
  uiType: UiBuildingType;
  rooms: number;
  storeys: number;
  shapeId: ShapeId;
  option: OptionKey;
  components: BuildComponents;
  running: boolean;
  areaBrief: AreaBrief | null;
  areaLoading: boolean;
  siteFacts?: { area_acres?: number; kind?: string };
  onPlace: () => void;
  onTypeChange: (type: UiBuildingType) => void;
  onRoomsChange: (rooms: number) => void;
  onStoreysChange: (storeys: number) => void;
  onShapeChange: (shapeId: ShapeId) => void;
  onOptionChange: (option: OptionKey) => void;
  onComponentChange: (field: keyof BuildComponents, value: string) => void;
  onRunStressTest: () => void;
}

function fmt(n: number | null | undefined, suffix = "", digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

export function DesignPanel({
  placed,
  siteName,
  canPlace = true,
  uiType,
  rooms,
  storeys,
  shapeId,
  option,
  components,
  running,
  areaBrief,
  areaLoading,
  siteFacts,
  onPlace,
  onTypeChange,
  onRoomsChange,
  onStoreysChange,
  onShapeChange,
  onOptionChange,
  onComponentChange,
  onRunStressTest,
}: DesignPanelProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(["Foundation"]),
  );
  const shape = getShape(shapeId);
  const distribution = shape.distribute(rooms, storeys);
  const storeyBounds = storeysRange(uiType);
  const avgRooms = avgRoomsPerStorey(rooms, storeys);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const shortName = siteName.split(",")[0] ?? siteName;

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-panel-border bg-panel">
      <div className="border-b border-panel-border px-3.5 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-soft">
          Building assembler
        </p>
        <h2 className="mt-0.5 text-[14px] font-semibold leading-tight text-text-strong">
          {placed ? "Design options" : "Place a building"}
        </h2>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
        <SiteClimateCard
          placeName={shortName}
          brief={areaBrief}
          loading={areaLoading}
          siteFacts={siteFacts}
        />

        {!placed ? (
          <div className="rounded-md border border-dashed border-panel-border bg-panel-muted/70 p-3">
            <p className="text-[12px] leading-snug text-text-soft">
              Click a green parcel on the map, then place a massing model to
              configure structure and HVAC.
            </p>
            <button
              type="button"
              onClick={onPlace}
              disabled={!canPlace}
              className="mt-3 w-full rounded bg-ink px-3 py-2.5 text-[13px] font-semibold text-accent hover:bg-ink-raised disabled:cursor-not-allowed disabled:opacity-45"
            >
              {canPlace
                ? `Place building at ${shortName}`
                : "Select a green parcel first"}
            </button>
          </div>
        ) : (
          <>
            <div>
              <span className="text-[11px] font-semibold text-text-soft">
                Building type
              </span>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {UI_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    disabled={running}
                    onClick={() => onTypeChange(t.key)}
                    title={t.blurb}
                    className={`flex flex-col items-center gap-1 rounded-md border px-1 py-2 transition-colors ${
                      uiType === t.key
                        ? "border-mint bg-[#e8f5ef]"
                        : "border-panel-border hover:bg-panel-muted"
                    }`}
                  >
                    <TypeIcon type={t.key} />
                    <span className="text-[10.5px] font-medium">{t.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2.5">
                <label
                  htmlFor="rooms-slider"
                  className="text-[10.5px] font-medium text-text-soft"
                >
                  Rooms:{" "}
                  <span className="font-semibold text-text-strong">{rooms}</span>
                </label>
                <input
                  id="rooms-slider"
                  type="range"
                  disabled={running}
                  min={uiType === "hotel" ? 10 : 2}
                  max={uiType === "hotel" ? 80 : 16}
                  value={rooms}
                  onChange={(e) => onRoomsChange(Number(e.target.value))}
                  className="mt-0.5 w-full accent-mint"
                />
              </div>
              <div className="mt-2">
                <label
                  htmlFor="storeys-slider"
                  className="text-[10.5px] font-medium text-text-soft"
                >
                  Floors (storeys):{" "}
                  <span className="font-semibold text-text-strong">
                    {storeys}
                  </span>
                </label>
                <input
                  id="storeys-slider"
                  type="range"
                  disabled={running}
                  min={storeyBounds.min}
                  max={storeyBounds.max}
                  value={storeys}
                  onChange={(e) => onStoreysChange(Number(e.target.value))}
                  className="mt-0.5 w-full accent-mint"
                />
              </div>
              <div className="mt-2.5">
                <span className="text-[10.5px] font-medium text-text-soft">
                  Shape
                </span>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {SHAPE_IDS.map((id) => {
                    const s = getShape(id);
                    const active = shapeId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={running}
                        title={s.blurb}
                        onClick={() => onShapeChange(id)}
                        className={`rounded-md border px-1.5 py-1.5 text-left transition-colors ${
                          active
                            ? "border-mint bg-[#e8f5ef]"
                            : "border-panel-border hover:bg-panel-muted"
                        }`}
                      >
                        <svg
                          viewBox="0 0 40 40"
                          className="mx-auto h-9 w-9 text-text-strong"
                          aria-hidden
                        >
                          {s.wireframePaths.map((d) => (
                            <path
                              key={d}
                              d={d}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                            />
                          ))}
                        </svg>
                        <p className="mt-0.5 text-center text-[10px] font-semibold">
                          {s.label}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] leading-snug text-text-soft">
                  ~{avgRooms} rooms/floor (derived from shape ·{" "}
                  {shape.label})
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {distribution.map((count, i) => (
                    <span
                      key={`L${i + 1}`}
                      className="rounded bg-panel-muted px-1.5 py-0.5 text-[9px] font-medium text-text-soft"
                      title={`Storey ${i + 1}`}
                    >
                      L{i + 1}:{count}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-text-soft">
                Configuration
              </span>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <PresetButton
                  active={option === "A"}
                  label="Option A"
                  sub="Concrete + Central"
                  onClick={() => onOptionChange("A")}
                />
                <PresetButton
                  active={option === "B"}
                  label="Option B"
                  sub="Timber + Heat Pumps"
                  onClick={() => onOptionChange("B")}
                />
              </div>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-text-soft">
                Components
              </span>
              <div className="mt-1 space-y-0.5">
                {COMPONENT_SECTIONS.map((section) => {
                  const open = openSections.has(section.title);
                  return (
                    <div key={section.title}>
                      <button
                        type="button"
                        onClick={() => toggleSection(section.title)}
                        className="flex w-full items-center gap-1.5 py-1.5 text-[11.5px] font-medium text-text-strong"
                      >
                        <Chevron open={open} small />
                        {section.title}
                      </button>
                      {open && (
                        <div className="mb-1.5 grid grid-cols-2 gap-1.5 pl-3">
                          {section.options.map((value) => (
                            <button
                              key={value}
                              type="button"
                              disabled={running}
                              onClick={() =>
                                onComponentChange(section.field, value)
                              }
                              className={`flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 ${
                                components[section.field] === value
                                  ? "border-mint bg-[#e8f5ef]"
                                  : "border-panel-border hover:bg-panel-muted"
                              }`}
                            >
                              <ComponentIcon
                                kind={
                                  value as Parameters<
                                    typeof ComponentIcon
                                  >[0]["kind"]
                                }
                              />
                              <span className="text-center text-[9.5px] leading-tight">
                                {COMPONENT_LABELS[value]}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="sticky bottom-0 -mx-3.5 border-t border-panel-border bg-panel px-3.5 pt-3 pb-1">
              <button
                type="button"
                onClick={onRunStressTest}
                disabled={running}
                className="w-full rounded bg-alert px-3 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {running ? "Running year stress…" : "Run year stress"}
              </button>
              <p className="mt-1.5 text-[9.5px] leading-snug text-text-soft">
                Parallel extreme weekends (heat, shoulder, July, winter). One
                portfolio memo.
              </p>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function SiteClimateCard({
  placeName,
  brief,
  loading,
  siteFacts,
}: {
  placeName: string;
  brief: AreaBrief | null;
  loading: boolean;
  siteFacts?: { area_acres?: number; kind?: string };
}) {
  if (loading && !brief) {
    return (
      <div className="rounded-md border border-panel-border bg-panel-muted/60 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-soft">
          Site climate
        </p>
        <p className="mt-1 text-[12px] text-text-soft">Loading live weather…</p>
      </div>
    );
  }

  if (!brief) return null;

  const c = brief.climate;
  const acres = siteFacts?.area_acres;
  const useLabel =
    siteFacts?.kind && siteFacts.kind !== "approx"
      ? siteFacts.kind.replace(/_/g, " ")
      : siteFacts?.kind === "approx"
        ? "approx pad"
        : null;

  return (
    <div className="rounded-md border border-panel-border bg-panel-muted px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-soft">
            Site climate · live{loading ? " · updating" : ""}
          </p>
          <p className="mt-0.5 truncate text-[12px] font-semibold text-text-strong">
            {placeName}
          </p>
        </div>
        <p className="shrink-0 text-[18px] font-semibold tabular-nums leading-none text-text-strong">
          {fmt(c.temp_c, "°", 0)}
        </p>
      </div>
      <p className="mt-1.5 text-[11.5px] text-text-strong">
        {c.weather ?? "—"}
        <span className="text-text-soft">
          {" "}
          · feels {fmt(c.feels_like_c, "°C", 0)}
        </span>
      </p>
      <dl className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
        <div className="rounded bg-white px-1 py-1">
          <dt className="text-text-soft">Humidity</dt>
          <dd className="font-semibold text-text-strong">
            {fmt(c.humidity_pct, "%")}
          </dd>
        </div>
        <div className="rounded bg-white px-1 py-1">
          <dt className="text-text-soft">Wind</dt>
          <dd className="font-semibold text-text-strong">
            {fmt(c.wind_kmh, "", 0)}
          </dd>
        </div>
        <div className="rounded bg-white px-1 py-1">
          <dt className="text-text-soft">Elev.</dt>
          <dd className="font-semibold text-text-strong">
            {fmt(brief.elevation_m, "m", 0)}
          </dd>
        </div>
      </dl>
      {(acres != null || useLabel) && (
        <>
          <dl className="mt-1.5 grid grid-cols-2 gap-1 text-center text-[10px]">
            <div className="rounded bg-white px-1 py-1">
              <dt className="text-text-soft">Acres</dt>
              <dd className="font-semibold tabular-nums text-text-strong">
                {acres != null && !Number.isNaN(acres) ? acres.toFixed(2) : "—"}
              </dd>
            </div>
            <div className="rounded bg-white px-1 py-1">
              <dt className="text-text-soft">Use</dt>
              <dd className="truncate font-semibold text-text-strong">
                {useLabel ?? "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-1.5 text-[9.5px] leading-snug text-text-soft">
            Approx. OSM polygon — not a legal survey.
          </p>
        </>
      )}
      {brief.land && (
        <p className="mt-1 text-[10px] leading-snug text-text-soft">
          {brief.land.empty_count} open parcels nearby
          {brief.land.kinds.length
            ? ` · ${brief.land.kinds.slice(0, 2).join(", ")}`
            : ""}
        </p>
      )}
    </div>
  );
}

function PresetButton({
  active,
  label,
  sub,
  onClick,
}: {
  active: boolean;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1.5 text-left transition-colors ${
        active
          ? "border-mint bg-[#e8f5ef]"
          : "border-panel-border hover:bg-panel-muted"
      }`}
    >
      <span className="block text-[11px] font-semibold">{label}</span>
      <span className="block text-[9.5px] text-text-soft">{sub}</span>
    </button>
  );
}

function Chevron({ open, small }: { open: boolean; small?: boolean }) {
  const size = small ? 10 : 14;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={`transition-transform ${open ? "" : "-rotate-90"}`}
      aria-hidden="true"
    >
      <path
        d="M3 6l5 5 5-5"
        fill="none"
        stroke="#5a665e"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
