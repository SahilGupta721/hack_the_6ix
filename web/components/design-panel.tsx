"use client";

import { useState } from "react";
import { ComponentIcon, TypeIcon } from "@/components/component-icons";
import {
  COMPONENT_LABELS,
  type BuildComponents,
} from "@/lib/build-config";
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
  { title: "Floors", field: "floors", options: ["mass_timber", "hollow_core"] },
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
  uiType: UiBuildingType;
  rooms: number;
  option: OptionKey;
  components: BuildComponents;
  running: boolean;
  onPlace: () => void;
  onTypeChange: (type: UiBuildingType) => void;
  onRoomsChange: (rooms: number) => void;
  onOptionChange: (option: OptionKey) => void;
  onComponentChange: (field: keyof BuildComponents, value: string) => void;
  onRunStressTest: () => void;
}

export function DesignPanel({
  placed,
  uiType,
  rooms,
  option,
  components,
  running,
  onPlace,
  onTypeChange,
  onRoomsChange,
  onOptionChange,
  onComponentChange,
  onRunStressTest,
}: DesignPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(COMPONENT_SECTIONS.map((s) => s.title)),
  );
  const [typeIndex, setTypeIndex] = useState(() =>
    Math.max(0, UI_TYPES.findIndex((t) => t.key === uiType)),
  );

  const toggleSection = (title: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const visibleTypes = [
    UI_TYPES[typeIndex % UI_TYPES.length],
    UI_TYPES[(typeIndex + 1) % UI_TYPES.length],
    UI_TYPES[(typeIndex + 2) % UI_TYPES.length],
  ];

  if (!placed) {
    return (
      <div className="pointer-events-auto absolute left-16 top-14 z-10 w-64 rounded-lg bg-panel p-4 shadow-xl">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-soft">
          Building Assembler
        </h2>
        <button
          onClick={onPlace}
          className="mt-3 w-full rounded bg-ink px-3 py-2.5 text-[13px] font-semibold text-accent hover:bg-ink-raised"
        >
          Place building at 45 The Esplanade
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute bottom-0 left-12 top-[30px] z-10 flex w-[276px] flex-col border-r border-panel-border bg-panel shadow-md">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between border-b border-panel-border px-3.5 py-2.5"
      >
        <span className="text-[13px] font-semibold">Design Options</span>
        <Chevron open={!collapsed} />
      </button>

      {!collapsed && (
        <div className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-soft">Type</span>
              <div className="flex gap-1">
                <CarouselArrow
                  dir="left"
                  onClick={() =>
                    setTypeIndex((i) => (i + UI_TYPES.length - 1) % UI_TYPES.length)
                  }
                />
                <CarouselArrow
                  dir="right"
                  onClick={() => setTypeIndex((i) => (i + 1) % UI_TYPES.length)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {visibleTypes.map((t) => (
                <button
                  key={t.key}
                  disabled={running}
                  onClick={() => onTypeChange(t.key)}
                  title={t.blurb}
                  className={`flex flex-col items-center gap-1 rounded-md border px-1 py-2 ${
                    uiType === t.key
                      ? "border-[#5B9BD5] bg-[#EAF4FB]"
                      : "border-panel-border hover:bg-panel-muted"
                  }`}
                >
                  <TypeIcon type={t.key} />
                  <span className="text-[10.5px] font-medium">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-2">
              <label
                htmlFor="rooms-slider"
                className="text-[10.5px] font-medium text-text-soft"
              >
                Rooms: <span className="font-semibold text-text-strong">{rooms}</span>
              </label>
              <input
                id="rooms-slider"
                type="range"
                disabled={running}
                min={uiType === "hotel" ? 10 : 2}
                max={uiType === "hotel" ? 80 : 16}
                value={rooms}
                onChange={(e) => onRoomsChange(Number(e.target.value))}
                className="mt-0.5 w-full accent-[#5B9BD5]"
              />
            </div>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-text-soft">
              Configuration presets
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
              Building Components
            </span>
            <div className="mt-1 space-y-1">
              {COMPONENT_SECTIONS.map((section) => {
                const open = openSections.has(section.title);
                return (
                  <div key={section.title}>
                    <button
                      onClick={() => toggleSection(section.title)}
                      className="flex w-full items-center gap-1.5 py-1 text-[11.5px] font-medium text-text-strong"
                    >
                      <Chevron open={open} small />
                      {section.title}
                    </button>
                    {open && (
                      <div className="mb-1.5 grid grid-cols-2 gap-1.5 pl-4">
                        {section.options.map((value) => (
                          <button
                            key={value}
                            disabled={running}
                            onClick={() => onComponentChange(section.field, value)}
                            className={`flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 ${
                              components[section.field] === value
                                ? "border-[#5B9BD5] bg-[#EAF4FB]"
                                : "border-panel-border hover:bg-panel-muted"
                            }`}
                          >
                            <ComponentIcon
                              kind={
                                value as Parameters<typeof ComponentIcon>[0]["kind"]
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

          <button
            onClick={onRunStressTest}
            disabled={running}
            className="w-full rounded bg-alert px-3 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {running ? "Running year stress..." : "Run year stress"}
          </button>
          <p className="text-[9.5px] leading-snug text-text-soft">
            Parallel extreme weekends (heat, shoulder, July, winter, deep cold).
            Not a full 8760h year. One portfolio memo.
          </p>
        </div>
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
      onClick={onClick}
      className={`rounded-md border px-2 py-1.5 text-left ${
        active
          ? "border-[#5B9BD5] bg-[#EAF4FB]"
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
        stroke="#5a6472"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CarouselArrow({
  dir,
  onClick,
}: {
  dir: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="grid h-5 w-5 place-items-center rounded border border-panel-border text-text-soft hover:bg-panel-muted"
      aria-label={dir === "left" ? "Previous type" : "Next type"}
    >
      <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d={dir === "left" ? "M8 2 4 6l4 4" : "M4 2l4 4-4 4"}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
