"use client";

interface LandingProps {
  onGetStarted: () => void;
  busy?: boolean;
}

export function Landing({ onGetStarted, busy = false }: LandingProps) {
  return (
    <section className="landing relative flex h-full min-h-0 flex-col overflow-hidden text-white">
      <div
        className="landing-hero absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/screenshot-assembler.png)" }}
        aria-hidden="true"
      />
      <div className="landing-veil absolute inset-0" aria-hidden="true" />

      <div className="relative z-10 flex h-full flex-col justify-end px-6 pb-16 pt-10 sm:px-12 sm:pb-20 md:px-16">
        <div className="landing-copy max-w-xl">
          <div className="flex items-center gap-3">
            <HexLogo />
            <p className="font-display text-[clamp(2.4rem,7vw,4.25rem)] font-semibold leading-none tracking-tight text-white">
              INN-SIGHT
            </p>
          </div>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/80 sm:text-[16px]">
            Know what to build before you build it: stress-test hotel and
            homestay options on a real Toronto site.
          </p>
          <button
            type="button"
            onClick={onGetStarted}
            disabled={busy}
            className="landing-cta mt-8 inline-flex items-center gap-2 rounded bg-accent px-6 py-3 text-[14px] font-semibold text-ink hover:brightness-105 disabled:opacity-60"
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
