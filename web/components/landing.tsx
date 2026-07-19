"use client";

import { clearLocalAuthState, loginHref, logoutHref } from "@/lib/auth0-shared";
import { useAuth } from "@/lib/use-auth";

interface LandingProps {
  onGetStarted: () => void;
  busy?: boolean;
}

export function Landing({ onGetStarted, busy = false }: LandingProps) {
  const auth = useAuth();

  return (
    <section className="landing relative flex h-full min-h-0 flex-col overflow-hidden text-white">
      <div
        className="landing-hero absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/screenshot-assembler.png)" }}
        aria-hidden="true"
      />
      <div className="landing-veil absolute inset-0" aria-hidden="true" />

      {auth.enabled && (
        <div className="relative z-10 flex items-center justify-end gap-2 px-6 pt-6 sm:px-12 md:px-16">
          {auth.loggedIn ? (
            <>
              <span className="max-w-[12rem] truncate text-[12px] text-white/70">
                {auth.name ?? "Signed in"}
              </span>
              <a
                href={logoutHref()}
                onClick={() => clearLocalAuthState()}
                className="rounded border border-white/25 px-2.5 py-1 text-[12px] text-white/85 hover:bg-white/10"
              >
                Log out
              </a>
            </>
          ) : (
            <a
              href={loginHref()}
              className="rounded border border-white/25 px-2.5 py-1 text-[12px] text-white/85 hover:bg-white/10"
            >
              Sign in
            </a>
          )}
        </div>
      )}

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 py-10 text-center">
        <div className="landing-copy flex max-w-2xl flex-col items-center">
          <div className="flex items-center justify-center gap-4">
            <HexLogo />
            <p className="font-display text-[clamp(3.25rem,9vw,6rem)] font-semibold leading-none tracking-tight text-white">
              INN-SIGHT
            </p>
          </div>
          <p className="mt-7 max-w-xl text-[18px] leading-relaxed text-white/85 sm:text-[23px]">
            Know what to build before you build it: stress-test hotel and
            homestay options on a real Toronto site.
          </p>
          <button
            type="button"
            onClick={onGetStarted}
            disabled={busy}
            className="landing-cta mt-10 inline-flex items-center gap-2 rounded-lg bg-accent px-14 py-6 text-[22px] font-semibold text-ink hover:brightness-105 disabled:opacity-60"
          >
            {busy ? "Checking session…" : "Get Started"}
          </button>
        </div>
      </div>
    </section>
  );
}

function HexLogo() {
  return (
    <svg width="42" height="42" viewBox="0 0 24 24" aria-hidden="true">
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
