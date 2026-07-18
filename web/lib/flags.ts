// Feature flags. The demo path must pass with every flag off.
function flag(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

export const FLAGS = {
  stay22: flag(process.env.NEXT_PUBLIC_FLAG_STAY22),
  auth0: flag(process.env.NEXT_PUBLIC_FLAG_AUTH0),
  renders: flag(process.env.NEXT_PUBLIC_FLAG_RENDERS),
  voice: flag(process.env.NEXT_PUBLIC_FLAG_VOICE),
  pixel: flag(process.env.NEXT_PUBLIC_FLAG_PIXEL),
} as const;

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
