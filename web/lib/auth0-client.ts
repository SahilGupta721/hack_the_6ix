import { Auth0Client } from "@auth0/nextjs-auth0/server";

// The client only exists when the tenant is provisioned; every consumer
// handles the null case so the app runs keyless out of the box.
function hasAuth0Env(): boolean {
  return Boolean(
    process.env.AUTH0_DOMAIN &&
      process.env.AUTH0_CLIENT_ID &&
      process.env.AUTH0_CLIENT_SECRET &&
      process.env.AUTH0_SECRET,
  );
}

export const auth0: Auth0Client | null = hasAuth0Env()
  ? new Auth0Client({
      authorizationParameters: process.env.AUTH0_AUDIENCE
        ? {
            audience: process.env.AUTH0_AUDIENCE,
            scope: "openid profile email offline_access",
          }
        : undefined,
      // Avoid Auth0 /oidc/logout "Oops" errors on many tenants; v2 + Allowed Logout URLs.
      logoutStrategy: "v2",
      includeIdTokenHintInOIDCLogoutUrl: false,
    })
  : null;
