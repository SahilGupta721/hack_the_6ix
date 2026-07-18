"use client";

import { useCallback, useEffect, useState } from "react";
import { FLAGS } from "@/lib/flags";
import { STEP_UP_ACR } from "@/lib/auth0-shared";

const MFA_KEY = "innsight-mfa-verified";
const ROLES_CLAIM = "https://innsight.app/roles";

export interface AuthState {
  enabled: boolean;
  loading: boolean;
  loggedIn: boolean;
  name: string | null;
  role: string | null; // architect | investor
  mfaVerified: boolean;
}

export function useAuth(): AuthState & { startStepUp: () => void } {
  const [state, setState] = useState<AuthState>({
    enabled: FLAGS.auth0,
    loading: FLAGS.auth0,
    loggedIn: false,
    name: null,
    role: null,
    mfaVerified: false,
  });

  useEffect(() => {
    if (!FLAGS.auth0) return;
    const verified = localStorage.getItem(MFA_KEY) === "1";
    setState((s) => ({ ...s, mfaVerified: verified }));

    fetch("/auth/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((user: Record<string, unknown> | null) => {
        if (!user) {
          setState((s) => ({ ...s, loading: false }));
          return;
        }
        const roles = user[ROLES_CLAIM];
        setState((s) => ({
          ...s,
          loading: false,
          loggedIn: true,
          name: typeof user.name === "string" ? user.name : null,
          role:
            Array.isArray(roles) && typeof roles[0] === "string"
              ? roles[0]
              : null,
        }));
      })
      .catch(() => {
        setState((s) => ({ ...s, loading: false }));
      });

    const onStorage = (e: StorageEvent) => {
      if (e.key === MFA_KEY && e.newValue === "1") {
        setState((s) => ({ ...s, mfaVerified: true, loggedIn: true }));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const startStepUp = useCallback(() => {
    window.open(
      `/auth/login?acr_values=${encodeURIComponent(STEP_UP_ACR)}&returnTo=${encodeURIComponent("/auth-complete")}`,
      "innsight-mfa",
      "width=480,height=720",
    );
  }, []);

  return { ...state, startStepUp };
}
