// Shared between server and client code; no server-only imports here.
export const STEP_UP_ACR =
  "http://schemas.openid.net/pape/policies/2007/06/multi-factor";

const GOOGLE_CONNECTION = "google-oauth2";

/** Auth0 login that skips the Universal Login picker and goes straight to Google. */
export function loginHref(returnTo = "/"): string {
  const params = new URLSearchParams({
    connection: GOOGLE_CONNECTION,
    returnTo,
  });
  return `/auth/login?${params.toString()}`;
}

export const logoutHref = "/auth/logout";
