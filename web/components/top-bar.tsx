"use client";

import { SITE } from "@/lib/site";
import { clearLocalAuthState, loginHref, logoutHref } from "@/lib/auth0-shared";
import { LocationSearch } from "@/components/location-search";
import type { GeocodeResult } from "@/lib/geocode";
import { useAuth } from "@/lib/use-auth";

export function TopBar({
  siteName,
  onSearchPlace,
}: {
  siteName?: string;
  onSearchPlace?: (place: GeocodeResult) => void;
}) {
  const auth = useAuth();
  const title = siteName ? `Project: ${siteName}` : SITE.projectTitle;

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 overflow-visible border-b border-ink-border bg-ink px-3 text-white sm:px-4">
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <HexLogo />
        <span className="text-[15px] font-semibold tracking-wide">INN-SIGHT</span>
      </div>
      <div className="hidden h-5 w-px shrink-0 bg-ink-border md:block" />
      <span className="hidden max-w-[10rem] truncate text-[12px] text-white/65 lg:max-w-[14rem] xl:inline">
        {title}
      </span>

      {onSearchPlace && (
        <div className="mx-auto min-w-0 flex-1 sm:max-w-sm lg:max-w-md">
          <LocationSearch onSelect={onSearchPlace} variant="dark" />
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2 text-white/60">
        {auth.enabled &&
          (auth.loggedIn ? (
            <>
              <span className="hidden max-w-[8rem] truncate rounded bg-ink-raised px-2 py-1 text-[11px] sm:inline">
                {auth.name ?? "Signed in"}
              </span>
              <a
                href={logoutHref()}
                onClick={() => clearLocalAuthState()}
                className="rounded border border-ink-border px-2 py-1 text-[11px] hover:bg-ink-raised"
              >
                Log out
              </a>
            </>
          ) : (
            <a
              href={loginHref()}
              className="rounded border border-ink-border px-2 py-1 text-[11px] hover:bg-ink-raised"
            >
              Sign in
            </a>
          ))}
        <span
          className="grid h-7 w-7 place-items-center rounded-full bg-ink-raised text-[10px] font-semibold"
          title="Account"
        >
          {auth.loggedIn && auth.name
            ? auth.name
                .split(/\s+/)
                .map((p) => p[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()
            : "?"}
        </span>
      </div>
    </header>
  );
}

function HexLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2 20.66 7v10L12 22 3.34 17V7L12 2Z"
        fill="none"
        stroke="#c4a35a"
        strokeWidth="1.6"
      />
      <path
        d="M8.5 15.5v-5l3.5 3 3.5-3v5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
