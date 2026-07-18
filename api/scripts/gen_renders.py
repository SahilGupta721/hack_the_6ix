"""Generate the static fallback streetscape renders with Nano Banana.

Run once GEMINI_API_KEY is in api/.env:
    .venv/bin/python api/scripts/gen_renders.py
Writes web/public/render-a.png and render-b.png (the offline fallbacks).
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.renders import PROMPTS, _generate  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "web" / "public"


def main() -> None:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY missing in api/.env")
    for option in ("A", "B"):
        png = _generate(option, api_key)
        path = OUT / f"render-{option.lower()}.png"
        path.write_bytes(png)
        print(f"wrote {path} ({len(png)} bytes)")


if __name__ == "__main__":
    main()
