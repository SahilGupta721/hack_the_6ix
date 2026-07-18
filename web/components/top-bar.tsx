"use client";

import { SITE } from "@/lib/site";
import { loginHref, logoutHref } from "@/lib/auth0-shared";
import { useAuth } from "@/lib/use-auth";

export function TopBar() {
  const auth = useAuth();
  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-ink-border bg-ink px-4 text-white">
      <div className="flex items-center gap-2">
        <HexLogo />
        <span className="text-[15px] font-semibold tracking-wide">
          INN-SIGHT
        </span>
      </div>
      <div className="h-5 w-px bg-ink-border" />
      <span className="text-[13px] text-white/80">{SITE.projectTitle}</span>
      <div className="ml-auto flex items-center gap-3 text-white/60">
        {auth.enabled &&
          (auth.loggedIn ? (
            <>
              <span className="rounded bg-ink-raised px-2 py-1 text-[11px]">
                {auth.name ?? "Signed in"}
                {auth.role && (
                  <span className="ml-1.5 rounded bg-accent/20 px-1 py-px text-[9px] font-bold uppercase text-accent">
                    {auth.role}
                  </span>
                )}
              </span>
              <a
                href={logoutHref}
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
              Sign in with Google
            </a>
          ))}
        <span
          className="grid h-7 w-7 place-items-center rounded-full border border-ink-border text-xs"
          title="Help"
        >
          ?
        </span>
        <span
          className="grid h-7 w-7 place-items-center rounded-full bg-ink-raised text-xs"
          title="Account"
        >
          {auth.loggedIn && auth.name
            ? auth.name
                .split(/\s+/)
                .map((p) => p[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()
            : "MA"}
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
        stroke="#f5c518"
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
