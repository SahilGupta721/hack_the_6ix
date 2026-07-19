"""Mirror the auth + NEXT_PUBLIC keys from the root .env into web/.env.local.

Next.js middleware (Edge context) only reads env files inside web/, so the
single root .env cannot reach it. Root .env stays the source of truth; run
this after editing it: python3 scripts/sync-web-env.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEYS = [
    "AUTH0_DOMAIN", "AUTH0_AUDIENCE", "AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET", "AUTH0_SECRET",
    "APP_BASE_URL", "NEXT_PUBLIC_API_BASE", "NEXT_PUBLIC_FLAG_STAY22",
    "NEXT_PUBLIC_FLAG_AUTH0", "NEXT_PUBLIC_FLAG_RENDERS",
    "NEXT_PUBLIC_FLAG_VOICE", "NEXT_PUBLIC_FLAG_PIXEL",
    "NEXT_PUBLIC_FLAG_AGENTS", "NEXT_PUBLIC_ELEVENLABS_AGENT_ID",
]

env = dict(re.findall(r"^([A-Z0-9_]+)=(.*)$", (ROOT / ".env").read_text(), re.M))
out = [
    "# AUTO-MIRRORED from repo-root .env (middleware cannot read outside web/).",
    "# Edit the ROOT .env, then re-run: python3 scripts/sync-web-env.py",
]
out += [f"{k}={env.get(k, '')}" for k in KEYS]
(ROOT / "web" / ".env.local").write_text("\n".join(out) + "\n")
print(f"web/.env.local synced ({sum(1 for k in KEYS if env.get(k))} values set)")
