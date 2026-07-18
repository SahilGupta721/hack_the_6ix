"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/flags";

interface MarketSummary {
  properties: number;
  priced: number;
  median_rate: number | null;
  min_rate: number | null;
}

interface MarketData {
  source: "live" | "cached" | "estimate";
  checkin: string;
  baseline_checkin: string;
  target: MarketSummary;
  baseline: MarketSummary;
  demand_ratio: number | null;
}

export function MarketPulse({
  lat,
  lng,
}: {
  lat?: number;
  lng?: number;
}) {
  const [data, setData] = useState<MarketData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setData(null);
    const params = new URLSearchParams();
    if (lat != null) params.set("lat", String(lat));
    if (lng != null) params.set("lng", String(lng));
    const qs = params.toString();
    fetch(`${API_BASE}/stay22/market${qs ? `?${qs}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setFailed(true));
  }, [lat, lng]);

  if (failed) return null;

  return (
    <div className="rounded border border-white/15 bg-white/5 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
        Live market check, Stay22 forward dates
        {data && (
          <span
            className={`ml-2 rounded px-1 py-px text-[9px] font-bold ${
              data.source === "live"
                ? "bg-mint/20 text-mint"
                : "bg-amber/20 text-amber"
            }`}
          >
            {data.source === "live" ? "LIVE" : "CACHED (disclosed)"}
          </span>
        )}
      </p>
      {!data ? (
        <p className="mt-1 text-[11px] text-white/50">Pulling live rates...</p>
      ) : (
        <p className="mt-1 text-[11.5px] leading-snug text-white/85">
          {data.target.priced} properties priced within 3 km for{" "}
          {data.checkin}: median ${data.target.median_rate ?? "n/a"}/night
          {data.demand_ratio !== null && data.baseline.median_rate !== null && (
            <>
              {" "}
              vs ${data.baseline.median_rate} four weeks out
              {"; "}
              <span
                className={
                  data.demand_ratio >= 1.05 ? "font-semibold text-accent" : ""
                }
              >
                {data.demand_ratio >= 1
                  ? `${Math.round((data.demand_ratio - 1) * 100)}% demand premium`
                  : "no demand premium"}
              </span>
              {data.demand_ratio >= 1.05 &&
                ": the fully booked stress weekend is what the market is pricing."}
            </>
          )}
        </p>
      )}
    </div>
  );
}
