"use client";

import { loginHref } from "@/lib/auth0-shared";

export type SignInReason = "start" | "stress" | "export";

interface SignInPromptProps {
  open: boolean;
  reason?: SignInReason;
  onClose: () => void;
}

const COPY: Record<SignInReason, string> = {
  start:
    "Sign in or create your profile with Google to open the building assembler.",
  stress:
    "Sign in to run a heat-wave stress test and generate your investor memo.",
  export: "Sign in to export or print your memo.",
};

const DISMISS: Record<SignInReason, string> = {
  start: "Back",
  stress: "Keep browsing",
  export: "Keep browsing",
};

export function SignInPrompt({
  open,
  reason = "stress",
  onClose,
}: SignInPromptProps) {
  if (!open) return null;

  const returnTo = reason === "start" ? "/?enter=1" : "/";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-in-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-ink-border bg-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="sign-in-title"
          className="text-[17px] font-semibold text-text-strong"
        >
          {reason === "start" ? "Sign in or create profile" : "Sign in to continue"}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-text-soft">
          {COPY[reason]} First-time Google sign-in creates your account
          automatically.
        </p>
        <a
          href={loginHref(returnTo)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded bg-ink px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-ink-raised"
        >
          <GoogleMark />
          Continue with Google
        </a>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded border border-panel-border px-3 py-2 text-[12px] font-medium text-text-soft hover:bg-panel-muted"
        >
          {DISMISS[reason]}
        </button>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l.1.1 6.2 5.2C39.3 36.9 44 32 44 24c0-1.3-.1-2.5-.4-3.5z"
      />
    </svg>
  );
}
