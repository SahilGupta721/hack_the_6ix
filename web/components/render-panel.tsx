"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/flags";
import type { OptionKey } from "@/lib/types";

export interface RenderSpec {
  storeys?: number;
  shape?: string;
  structure?: string;
  hvac?: string;
  facade?: string;
  siteName?: string;
  buildingType?: string;
  rooms?: number;
}

type Source = "live" | "static" | "none";

function renderQuery(spec?: RenderSpec): string {
  if (!spec) return "";
  const params = new URLSearchParams();
  if (spec.storeys != null) params.set("storeys", String(spec.storeys));
  if (spec.shape) params.set("shape", spec.shape);
  if (spec.structure) params.set("structure", spec.structure);
  if (spec.hvac) params.set("hvac", spec.hvac);
  if (spec.facade) params.set("facade", spec.facade);
  if (spec.siteName) params.set("site_name", spec.siteName);
  if (spec.buildingType) params.set("building_type", spec.buildingType);
  if (spec.rooms != null) params.set("rooms", String(spec.rooms));
  const q = params.toString();
  return q ? `?${q}` : "";
}

export function RenderPanel({
  option,
  spec,
}: {
  option: OptionKey;
  spec?: RenderSpec;
}) {
  const [source, setSource] = useState<Source>("none");
  const [url, setUrl] = useState<string | null>(null);
  const query = renderQuery(spec);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const liveUrl = `${API_BASE}/render/${option}${query}`;
    const staticUrl = `/render-${option.toLowerCase()}.png`;
    setSource("none");
    setUrl(null);

    fetch(liveUrl, { method: "GET" })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          await probeStatic();
          return;
        }
        const blob = await r.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setSource("live");
      })
      .catch(() => probeStatic());

    async function probeStatic() {
      try {
        const r = await fetch(staticUrl, { method: "HEAD" });
        if (cancelled) return;
        if (r.ok) {
          setUrl(staticUrl);
          setSource("static");
        } else {
          setSource("none");
        }
      } catch {
        if (!cancelled) setSource("none");
      }
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [option, query]);

  if (source === "none" || !url) return null;

  const shapeBit = spec?.shape ? spec.shape.replace("_", " ") : null;
  const storeyBit = spec?.storeys != null ? `${spec.storeys}-storey` : null;

  return (
    <div className="w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Illustrative streetscape render, Option ${option}`}
        className="w-full rounded border border-white/15"
      />
      <p className="mt-0.5 text-[9px] text-white/45">
        Illustrative streetscape, Nano Banana
        {source === "live" && (storeyBit || shapeBit)
          ? ` · prompted for ${[storeyBit, shapeBit].filter(Boolean).join(" ")}`
          : ""}
        {source === "static" &&
          " (static fallback — may not match current massing)"}
      </p>
    </div>
  );
}
