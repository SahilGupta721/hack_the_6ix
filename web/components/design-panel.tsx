"use client";

import type { BuildingType, OptionKey } from "@/lib/types";

const BUILDING_TYPES: {
  key: BuildingType;
  label: string;
  rooms: number;
  blurb: string;
}[] = [
  { key: "homestay", label: "Homestay", rooms: 6, blurb: "6 rooms, converted house" },
  { key: "boutique", label: "Boutique Hotel", rooms: 40, blurb: "40 rooms, full service" },
  { key: "tower", label: "Tower", rooms: 200, blurb: "200 rooms, high-rise" },
];

interface DesignPanelProps {
  placed: boolean;
  buildingType: BuildingType;
  rooms: number;
  option: OptionKey;
  running: boolean;
  onPlace: () => void;
  onTypeChange: (type: BuildingType, rooms: number) => void;
  onRoomsChange: (rooms: number) => void;
  onOptionChange: (option: OptionKey) => void;
  onRunStressTest: () => void;
}

export function DesignPanel({
  placed,
  buildingType,
  rooms,
  option,
  running,
  onPlace,
  onTypeChange,
  onRoomsChange,
  onOptionChange,
  onRunStressTest,
}: DesignPanelProps) {
  return (
    <div className="flex w-64 flex-col gap-4 overflow-y-auto border-r border-panel-border bg-panel p-4">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-soft">
          Building Assembler
        </h2>
        <p className="mt-0.5 text-[13px] font-semibold">Design Options</p>
      </div>

      {!placed ? (
        <button
          onClick={onPlace}
          className="rounded bg-ink px-3 py-2.5 text-[13px] font-semibold text-accent hover:bg-ink-raised"
        >
          Place building at 45 The Esplanade
        </button>
      ) : (
        <>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-soft">
              Type
            </legend>
            {BUILDING_TYPES.map((t) => (
              <label
                key={t.key}
                className={`flex cursor-pointer items-center justify-between rounded border px-2.5 py-2 text-[12px] ${
                  buildingType === t.key
                    ? "border-ink bg-panel-muted font-semibold"
                    : "border-panel-border hover:bg-panel-muted"
                }`}
              >
                <span>
                  {t.label}
                  <span className="block text-[10px] font-normal text-text-soft">
                    {t.blurb}
                  </span>
                </span>
                <input
                  type="radio"
                  name="building-type"
                  checked={buildingType === t.key}
                  disabled={running}
                  onChange={() => onTypeChange(t.key, t.rooms)}
                  className="accent-[#14181f]"
                />
              </label>
            ))}
          </fieldset>

          <div>
            <label
              htmlFor="rooms-slider"
              className="text-[11px] font-semibold uppercase tracking-wider text-text-soft"
            >
              Rooms: <span className="text-text-strong">{rooms}</span>
            </label>
            <input
              id="rooms-slider"
              type="range"
              disabled={running}
              min={buildingType === "homestay" ? 2 : buildingType === "boutique" ? 10 : 100}
              max={buildingType === "homestay" ? 12 : buildingType === "boutique" ? 80 : 400}
              value={rooms}
              onChange={(e) => onRoomsChange(Number(e.target.value))}
              className="mt-1 w-full accent-[#f5c518]"
            />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-soft">
              Configuration
            </legend>
            <OptionCard
              active={option === "A"}
              title="Option A"
              subtitle="Concrete + Central HVAC"
              swatch="#9aa5b1"
              onSelect={() => onOptionChange("A")}
            />
            <OptionCard
              active={option === "B"}
              title="Option B"
              subtitle="Mass Timber + Heat Pumps"
              swatch="#d97e3f"
              onSelect={() => onOptionChange("B")}
            />
          </fieldset>

          <button
            onClick={onRunStressTest}
            disabled={running}
            className="rounded bg-alert px-3 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {running ? "Running stress test..." : "Run heat-wave stress test"}
          </button>
          <p className="text-[10px] leading-snug text-text-soft">
            Scenario: fully booked heat-wave weekend, 36.2 C peak (Toronto,
            July 14, 2026 event profile).
          </p>
        </>
      )}
    </div>
  );
}

function OptionCard({
  active,
  title,
  subtitle,
  swatch,
  onSelect,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  swatch: string;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 rounded border px-2.5 py-2 text-left text-[12px] ${
        active
          ? "border-ink bg-panel-muted font-semibold"
          : "border-panel-border hover:bg-panel-muted"
      }`}
    >
      <span
        className="h-6 w-6 shrink-0 rounded-sm border border-black/20"
        style={{ background: swatch }}
      />
      <span>
        {title}
        <span className="block text-[10px] font-normal text-text-soft">
          {subtitle}
        </span>
      </span>
    </button>
  );
}
