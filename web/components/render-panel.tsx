"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/flags";
import type { OptionKey } from "@/lib/types";

type Source = "live" | "static" | "none";

export function RenderPanel({ option }: { option: OptionKey }) {
  const [source, setSource] = useState<Source>("none");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const liveUrl = `${API_BASE}/render/${option}`;
    const staticUrl = `/render-${option.toLowerCase()}.png`;

    fetch(liveUrl, { method: "GET" })
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setUrl(liveUrl);
          setSource("live");
        } else {
          return probeStatic();
        }
      })
      .catch(() => probeStatic());

    function probeStatic() {
      return fetch(staticUrl, { method: "HEAD" }).then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setUrl(staticUrl);
          setSource("static");
        } else {
          setSource("none");
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [option]);

  if (source === "none" || !url) return null;

  return (
    <div className="w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Illustrative streetscape render, Option ${option}`}
        className="w-full rounded border border-white/15"
      />
      <p className="mt-0.5 text-[9px] text-white/45">
        Illustrative streetscape, Nano Banana image model
        {source === "static" && " (static fallback, disclosed)"}
      </p>
    </div>
  );
}
