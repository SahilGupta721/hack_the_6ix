"use client";

import { useCallback, useEffect, useState } from "react";
import { syncAuthUser } from "@/lib/api";
import { FLAGS } from "@/lib/flags";
import { MFA_KEY, STEP_UP_ACR } from "@/lib/auth0-shared";

const ROLES_CLAIM = "https://innsight.app/roles";

export interface AuthState {
  enabled: boolean;
  loading: boolean;
  loggedIn: boolean;
  sub: string | null;
  name: string | null;
  role: string | null; // architect | investor
  mfaVerified: boolean;
}

export function useAuth(): AuthState & { startStepUp: () => void } {
  const [state, setState] = useState<AuthState>({
    enabled: FLAGS.auth0,
    loading: FLAGS.auth0,
    loggedIn: false,
    sub: null,
    name: null,
    role: null,
    mfaVerified: false,
  });

  useEffect(() => {
    if (!FLAGS.auth0) return;
    const verified = localStorage.getItem(MFA_KEY) === "1";
    setState((s) => ({ ...s, mfaVerified: verified }));

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);

    fetch("/auth/profile", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (user: Record<string, unknown> | null) => {
        if (!user) {
          setState((s) => ({ ...s, loading: false }));
          return;
        }
        const roles = user[ROLES_CLAIM];
        const role =
          Array.isArray(roles) && typeof roles[0] === "string"
            ? roles[0]
            : null;
        const sub = typeof user.sub === "string" ? user.sub : null;
        // Unlock UI immediately — Mongo sync must not delay Get Started.
        setState((s) => ({
          ...s,
          loading: false,
          loggedIn: true,
          sub,
          name: typeof user.name === "string" ? user.name : null,
          role,
        }));

        if (sub) {
          void syncAuthUser({
            sub,
            email: typeof user.email === "string" ? user.email : null,
            name: typeof user.name === "string" ? user.name : null,
            picture: typeof user.picture === "string" ? user.picture : null,
            role,
          }).catch(() => undefined);
        }
      })
      .catch(() => {
        setState((s) => ({ ...s, loading: false }));
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });

    const onStorage = (e: StorageEvent) => {
      if (e.key === MFA_KEY && e.newValue === "1") {
        setState((s) => ({ ...s, mfaVerified: true, loggedIn: true }));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
      window.removeEventListener("storage", onStorage);
    };
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
