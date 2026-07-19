"use client";

import { useEffect, useRef, useState } from "react";
import { searchPlaces, type GeocodeResult } from "@/lib/geocode";

interface LocationSearchProps {
  onSelect: (place: GeocodeResult) => void;
  variant?: "light" | "dark";
}

export function LocationSearch({
  onSelect,
  variant = "light",
}: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dark = variant === "dark";

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError(null);
      setOpen(false);
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
          setOpen(hits.length > 0);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Search failed — is the API on :8000?");
        setResults([]);
        setOpen(false);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 120);

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
    <div ref={rootRef} className="relative z-50 w-full">
      <div
        className={`rounded-md border ${
          dark
            ? "border-white/15 bg-white/10 backdrop-blur-sm"
            : "border-panel-border bg-white shadow-md"
        }`}
      >
        <label className="sr-only" htmlFor="location-search">
          Search for a build location
        </label>
        <div className="flex items-center gap-2 px-3">
          <SearchIcon light={!dark} />
          <input
            id="location-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search city or address…"
            className={`w-full py-2 text-[13px] outline-none ${
              dark
                ? "bg-transparent text-white placeholder:text-white/45"
                : "text-text-strong placeholder:text-text-soft"
            }`}
            autoComplete="off"
          />
          {loading && (
            <span
              className={`shrink-0 text-[10px] ${dark ? "text-white/50" : "text-text-soft"}`}
            >
              …
            </span>
          )}
        </div>
        {error && (
          <p
            className={`border-t px-3 py-1.5 text-[11px] ${
              dark
                ? "border-white/10 text-red-300"
                : "border-panel-border text-alert"
            }`}
          >
            {error}
          </p>
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          className={`absolute left-0 right-0 top-full z-[100] mt-1 max-h-56 overflow-y-auto rounded-md border shadow-xl ${
            dark
              ? "border-ink-border bg-ink-raised"
              : "border-panel-border bg-white"
          }`}
          role="listbox"
        >
          {results.map((r) => (
            <li key={`${r.lat},${r.lng},${r.displayName}`} role="option">
              <button
                type="button"
                onClick={() => pick(r)}
                className={`w-full px-3 py-2.5 text-left text-[12px] leading-snug ${
                  dark
                    ? "text-white/90 hover:bg-white/10"
                    : "text-text-strong hover:bg-panel-muted"
                }`}
              >
                {r.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchIcon({ light }: { light: boolean }) {
  const stroke = light ? "#5a665e" : "rgba(255,255,255,0.55)";
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle
        cx="7"
        cy="7"
        r="4.5"
        fill="none"
        stroke={stroke}
        strokeWidth="1.4"
      />
      <path d="M10.5 10.5 14 14" stroke={stroke} strokeWidth="1.4" />
    </svg>
  );
}
