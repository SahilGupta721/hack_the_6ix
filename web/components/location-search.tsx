"use client";

import { useEffect, useRef, useState } from "react";
import { searchPlaces, type GeocodeResult } from "@/lib/geocode";

interface LocationSearchProps {
  onSelect: (place: GeocodeResult) => void;
}

export function LocationSearch({ onSelect }: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setError(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const hits = await searchPlaces(q, controller.signal);
        if (!controller.signal.aborted) {
          setResults(hits);
          setOpen(true);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Search failed — is the API on :8000?");
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (place: GeocodeResult) => {
    setQuery(place.displayName.split(",")[0] ?? place.displayName);
    setOpen(false);
    setResults([]);
    onSelect(place);
  };

  return (
    <div ref={rootRef} className="relative w-full max-w-sm">
      <div className="overflow-hidden rounded-md border border-panel-border bg-white shadow-md">
        <label className="sr-only" htmlFor="location-search">
          Search for a build location
        </label>
        <div className="flex items-center gap-2 px-3">
          <SearchIcon />
          <input
            id="location-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search city or address…"
            className="w-full py-2.5 text-[13px] text-text-strong outline-none placeholder:text-text-soft"
            autoComplete="off"
          />
          {loading && (
            <span className="shrink-0 text-[10px] text-text-soft">…</span>
          )}
        </div>
        {error && (
          <p className="border-t border-panel-border px-3 py-1.5 text-[11px] text-alert">
            {error}
          </p>
        )}
        {open && results.length > 0 && (
          <ul className="max-h-52 overflow-y-auto border-t border-panel-border">
            {results.map((r) => (
              <li key={`${r.lat},${r.lng},${r.displayName}`}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  className="w-full px-3 py-2 text-left text-[12px] leading-snug text-text-strong hover:bg-panel-muted"
                >
                  {r.displayName}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle
        cx="7"
        cy="7"
        r="4.5"
        fill="none"
        stroke="#5a6472"
        strokeWidth="1.4"
      />
      <path d="M10.5 10.5 14 14" stroke="#5a6472" strokeWidth="1.4" />
    </svg>
  );
}
