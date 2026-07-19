"""App-scoped chat: RAG-lite over handbook chunks + live memo context."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

PACKS_DIR = Path(__file__).resolve().parent / "packs"
HANDBOOK_PATH = PACKS_DIR / "chat_handbook.json"

_SYSTEM = """You are INN-SIGHT's in-app consultant assistant.
Only answer questions about INN-SIGHT: the map/site assembler, year stress tests,
investor memos, Option A vs B, acres/land use, climate, rules & compliance
(zoning / OBC / TGS overlays), and honesty of the numbers.

EDGE CASES (follow exactly):
1) Off-topic (sports, news, trivia, other apps): short apology + redirect to product topics. No brochure dump.
2) User asks to explain / summarize the memo but memo_context is null:
   - Say there is no memo yet (they must Place building → Run year stress).
   - Offer to explain what an investor memo is.
   - Offer other help (year stress, acres, Option A vs B).
3) User asks what a memo is (even with no memo): explain from handbook; do not pretend numbers exist.
4) User asks why Option A/B or recommendation with no memo: say results appear after year stress; briefly what A vs B means.
5) Memo present: use only memo_context numbers; never invent kWh/$.
6) Greetings (hi/hello): welcome briefly and list what you can help with.

Prefer 2–4 sentence answers that directly address the user question first.
Use the highest-ranked handbook chunk; do not lead with a generic product pitch
unless they asked what INN-SIGHT is."""

_OFFTOPIC_REFUSAL = (
    "Sorry - I can only help with INN-SIGHT (sites, year stress, Option A/B, "
    "acres, climate, compliance, or your investor memo). "
    "Try asking: How does year stress work? | What are acres? | Explain this memo."
)

_GREETING_REPLY = (
    "Hi - I am the INN-SIGHT assistant. I can help with your site (acres, climate), "
    "how year stress works, Option A vs B, rules & compliance, or your investor memo "
    "after you run a stress test. What would you like to know?"
)

_NO_MEMO_EXPLAIN = (
    "There is no investor memo to explain yet. "
    "Place a building on the map, then click Run year stress to generate one. "
    "Want me to explain what a memo is, how year stress works, or what acres mean on the site card?"
)

_NO_MEMO_OPTIONS = (
    "I do not have A vs B results yet - those appear in the memo after Run year stress. "
    "In short: Option A is usually concrete + central HVAC; Option B is mass timber + heat pumps. "
    "Want a deeper comparison of how we choose a recommendation, or how year stress works?"
)

_WHAT_IS_MEMO = (
    "An INN-SIGHT investor memo is the report after year stress: Option A vs B costs, "
    "carbon, peak grid strain, a recommendation with reasoning, narrative, and footnotes "
    "to sourced benchmarks. Numbers come from the deterministic model - chat will not invent them. "
    "Generate one with Place building → Run year stress, then ask Explain this memo."
)


# Tokens that count as in-scope for this product.
_ON_TOPIC_TOKENS = {
    "innsight",
    "inn",
    "sight",
    "hotel",
    "homestay",
    "bnb",
    "boutique",
    "tower",
    "building",
    "assembler",
    "parcel",
    "acres",
    "acre",
    "area",
    "land",
    "osm",
    "map",
    "site",
    "climate",
    "weather",
    "temp",
    "temperature",
    "humidity",
    "wind",
    "elevation",
    "stress",
    "year",
    "weekend",
    "heat",
    "cold",
    "heatwave",
    "era5",
    "peak",
    "strain",
    "kw",
    "kwh",
    "energy",
    "carbon",
    "co2",
    "tco2e",
    "option",
    "concrete",
    "timber",
    "hvac",
    "pump",
    "memo",
    "investor",
    "recommend",
    "recommendation",
    "footnote",
    "benchmark",
    "sim",
    "model",
    "cost",
    "capex",
    "abatement",
    "friction",
    "auth0",
    "sign",
    "login",
    "logout",
    "place",
    "massing",
    "storey",
    "storeys",
    "floor",
    "rooms",
    "explain",
    "honest",
    "estimate",
    "toronto",
    "esplanade",
    "compliance",
    "zoning",
    "bylaw",
    "setback",
    "setbacks",
    "obc",
    "tgs",
    "emtc",
    "angular",
    "fsi",
    "permit",
    "overlay",
    "parking",
}


class ChatTurn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)


class ChatSite(BaseModel):
    name: str | None = None
    lat: float | None = None
    lng: float | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=12)
    memo: dict[str, Any] | None = None
    briefs: dict[str, Any] | None = None
    synthesis: dict[str, Any] | None = None
    site: ChatSite | None = None


class ChatResponse(BaseModel):
    reply: str
    citations: list[str] = Field(default_factory=list)
    generator: str  # gemini | fallback
    fallback_reason: str | None = None


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


# Weak question words alone do not make a query on-topic.
_WEAK_TOKENS = {
    "a",
    "an",
    "the",
    "is",
    "are",
    "was",
    "were",
    "do",
    "does",
    "did",
    "can",
    "could",
    "should",
    "would",
    "will",
    "what",
    "when",
    "where",
    "who",
    "whom",
    "which",
    "why",
    "how",
    "me",
    "my",
    "your",
    "this",
    "that",
    "it",
    "to",
    "for",
    "of",
    "on",
    "in",
    "about",
    "please",
    "tell",
    "show",
    "help",
}


def is_on_topic(message: str) -> bool:
    """True if the question looks related to INN-SIGHT / memo / site."""
    tokens = _tokens(message) - _WEAK_TOKENS
    if not tokens:
        return False
    if tokens & _ON_TOPIC_TOKENS:
        return True
    for chunk in _load_handbook():
        keys = {str(k).lower() for k in (chunk.get("keywords") or [])}
        title_bits = _tokens(str(chunk.get("title") or "")) - _WEAK_TOKENS
        if tokens & (keys | title_bits):
            return True
    return False


def _load_handbook() -> list[dict[str, Any]]:
    data = json.loads(HANDBOOK_PATH.read_text(encoding="utf-8"))
    chunks = data.get("chunks") or []
    return [c for c in chunks if isinstance(c, dict) and c.get("text")]


def retrieve_chunks(query: str, *, limit: int = 3) -> list[dict[str, Any]]:
    """Keyword / phrase score static handbook chunks (RAG-lite)."""
    q = query.lower().strip()
    tokens = _tokens(q) - _WEAK_TOKENS
    scored: list[tuple[int, dict[str, Any]]] = []

    for chunk in _load_handbook():
        keys = [str(k).lower() for k in (chunk.get("keywords") or [])]
        title = str(chunk.get("title") or "").lower()
        body = str(chunk.get("text") or "").lower()
        cid = str(chunk.get("id") or "")
        score = 0

        # Phrase hits beat single tokens.
        for key in keys:
            if " " in key and key in q:
                score += 4
            elif " " not in key and key in tokens:
                score += 2

        # Title/body token overlap (ignore weak words).
        title_toks = _tokens(title) - _WEAK_TOKENS
        score += sum(1 for t in tokens if t in title_toks)

        # Intent boosts — prefer specific topics over the product blurb.
        if tokens & {"stress", "testing", "test", "strain", "weekend", "era5"} and cid == "stress":
            score += 5
        if tokens & {"memo", "report", "footnote"} and cid == "memo":
            score += 4
        if tokens & {"acre", "acres", "parcel", "brownfield", "parking"} and cid == "acres":
            score += 4
        if tokens & {"option", "concrete", "timber", "hvac", "abatement"} and cid == "options":
            score += 4
        if tokens & {"climate", "humidity", "wind", "elevation", "forecast"} and cid == "climate":
            score += 4
        if tokens & {
            "compliance",
            "zoning",
            "bylaw",
            "setback",
            "setbacks",
            "obc",
            "tgs",
            "emtc",
            "angular",
            "fsi",
            "permit",
            "overlay",
        } and cid == "compliance":
            score += 5
        if tokens & {"innsight", "product", "app", "tool", "platform"} and cid == "product":
            score += 3

        # Demote generic product overview unless they asked about the product.
        if cid == "product" and not (tokens & {"innsight", "product", "app", "tool", "platform", "overview"}):
            score -= 3

        if score > 0:
            scored.append((score, chunk))

    scored.sort(key=lambda t: (-t[0], str(t[1].get("id"))))
    return [c for _, c in scored[:limit]]


def _direct_answer(query: str, chunk: dict[str, Any]) -> str:
    """Lead with a short answer line, then the chunk body."""
    text = str(chunk.get("text") or "").strip()
    title = str(chunk.get("title") or "INN-SIGHT")
    q = query.lower()
    if any(w in q for w in ("what is", "what's", "whats", "what does", "explain", "how does", "how do")):
        return f"{title}: {text}"
    return text


def slim_memo(memo: dict[str, Any] | None) -> dict[str, Any] | None:
    if not memo:
        return None
    options = []
    for opt in memo.get("options") or []:
        if not isinstance(opt, dict):
            continue
        options.append(
            {
                "label": opt.get("label") or opt.get("name"),
                "peak_kw": opt.get("peak_kw"),
                "strain_class": opt.get("strain_class"),
                "annual_operating_cost": opt.get("annual_operating_cost"),
                "construction_cost": opt.get("construction_cost"),
                "tco2e_total": opt.get("tco2e_total"),
                "friction": opt.get("friction"),
            }
        )
    narrative = memo.get("narrative") or {}
    comparison = memo.get("comparison") or {}
    return {
        "title": memo.get("title"),
        "scenario": memo.get("scenario"),
        "kind": memo.get("kind"),
        "recommended": comparison.get("recommended") or memo.get("recommended"),
        "options": options,
        "reasoning_chain": (memo.get("reasoning_chain") or [])[:8],
        "narrative": {
            "summary": narrative.get("summary"),
            "reasoning": (narrative.get("reasoning") or [])[:6],
            "caveats": (narrative.get("caveats") or [])[:4],
            "generator": narrative.get("generator"),
        },
        "footnote_keys": [
            f.get("key") for f in (memo.get("footnotes") or [])[:12] if isinstance(f, dict)
        ],
    }


def _has_usable_memo(memo: dict[str, Any] | None) -> bool:
    slim = slim_memo(memo)
    if not slim:
        return False
    narr = slim.get("narrative") or {}
    if narr.get("summary") or (narr.get("reasoning") or []):
        return True
    if slim.get("options") or slim.get("recommended"):
        return True
    return False


def _is_greeting(message: str) -> bool:
    t = _tokens(message) - _WEAK_TOKENS
    greet = {"hi", "hello", "hey", "yo", "sup", "thanks", "thank", "hola"}
    return bool(t) and t <= greet


def _asks_what_is_memo(message: str) -> bool:
    q = message.lower()
    if "memo" not in q:
        return False
    return any(
        p in q
        for p in (
            "what is",
            "what's",
            "whats",
            "what does",
            "mean",
            "define",
            "definition",
            "tell me about a memo",
            "tell me about the memo format",
        )
    )


def _asks_explain_memo(message: str) -> bool:
    q = message.lower()
    if "memo" in q and any(
        w in q for w in ("explain", "summarize", "summary", "walk me", "break down")
    ):
        return True
    if q.strip() in {"explain this memo", "explain memo", "explain the memo"}:
        return True
    return False


def _asks_options_or_recommend(message: str) -> bool:
    q = message.lower()
    return any(
        p in q
        for p in (
            "option a",
            "option b",
            "why a",
            "why b",
            "recommend",
            "recommendation",
            "which option",
            "better option",
        )
    )


def _explain_memo_text(memo: dict[str, Any]) -> str:
    slim = slim_memo(memo) or {}
    narr = slim.get("narrative") or {}
    parts: list[str] = []
    if narr.get("summary"):
        parts.append(str(narr["summary"]).strip())
    for line in narr.get("reasoning") or []:
        parts.append(str(line))
    rec = slim.get("recommended")
    if rec:
        parts.append(f"Recommended option: {rec}.")
    for cave in (narr.get("caveats") or [])[:2]:
        parts.append(f"Caveat: {cave}")
    if not parts:
        return (
            "A memo is loaded but has little narrative text. "
            "Open View memo in the stress overlay for the full tables, or ask about peak strain / costs."
        )
    return " ".join(parts)[:1400]


def _build_user_prompt(
    message: str,
    history: list[ChatTurn],
    chunks: list[dict[str, Any]],
    memo: dict[str, Any] | None,
    briefs: dict[str, Any] | None,
    synthesis: dict[str, Any] | None,
    site: ChatSite | None,
) -> str:
    handbook = [
        {"id": c.get("id"), "title": c.get("title"), "text": c.get("text")}
        for c in chunks
    ]
    hist = [
        {"role": t.role, "content": t.content[:1500]}
        for t in history[-8:]
    ]
    has_memo = _has_usable_memo(memo)
    payload = {
        "flags": {
            "has_memo": has_memo,
            "is_greeting": _is_greeting(message),
            "asks_explain_memo": _asks_explain_memo(message),
            "asks_what_is_memo": _asks_what_is_memo(message),
            "asks_options": _asks_options_or_recommend(message),
        },
        "site": site.model_dump() if site else None,
        "handbook_chunks": handbook,
        "memo_context": slim_memo(memo) if has_memo else None,
        "boss_synthesis": (
            {
                "headline": (synthesis or {}).get("headline"),
                "recommendation": (synthesis or {}).get("recommendation"),
                "risks": ((synthesis or {}).get("risks") or [])[:4],
            }
            if synthesis
            else None
        ),
        "agent_brief_ids": list((briefs or {}).keys())[:8] if briefs else [],
        "recent_history": hist,
        "user_question": message,
    }
    return json.dumps(payload, default=str, indent=2)


def _fallback_reply(
    message: str,
    memo: dict[str, Any] | None,
    chunks: list[dict[str, Any]],
) -> str:
    if not is_on_topic(message) and not _is_greeting(message):
        return _OFFTOPIC_REFUSAL
    if _is_greeting(message):
        return _GREETING_REPLY

    has_memo = _has_usable_memo(memo)

    if _asks_what_is_memo(message):
        return _WHAT_IS_MEMO

    if _asks_explain_memo(message):
        if has_memo and memo:
            return _explain_memo_text(memo)
        return _NO_MEMO_EXPLAIN

    if _asks_options_or_recommend(message):
        if has_memo and memo:
            return _explain_memo_text(memo)
        return _NO_MEMO_OPTIONS

    # Generic "memo" mention without explain → guide
    if "memo" in message.lower() and not has_memo:
        return _NO_MEMO_EXPLAIN

    if chunks:
        return _direct_answer(message, chunks[0])[:1000]
    return (
        "I can help with INN-SIGHT sites, year stress, Option A vs B, acres, "
        "rules & compliance, or your memo. What would you like to know?"
    )


def _gemini_text(system: str, user: str, api_key: str) -> str:
    from google import genai
    from google.genai import types

    from app.agents.ai_energy import call_label, record_gemini_usage
    from app.agents.llm import GEMINI_MODEL, _GEMINI_SEM

    with _GEMINI_SEM:
        with call_label("chat"):
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=f"{system}\n\nUSER PAYLOAD:\n{user}",
                config=types.GenerateContentConfig(temperature=0.25),
            )
    record_gemini_usage(response, model=GEMINI_MODEL)
    text = (getattr(response, "text", None) or "").strip()
    if not text:
        raise RuntimeError("empty_gemini_chat_reply")
    return text


def answer_chat(req: ChatRequest) -> ChatResponse:
    # Affirmative follow-up after we offered to explain what a memo is.
    affirm = _tokens(req.message) - _WEAK_TOKENS
    if affirm and affirm <= {"yes", "yeah", "yep", "sure", "ok", "okay", "please"}:
        last_assist = next(
            (t.content.lower() for t in reversed(req.history) if t.role == "assistant"),
            "",
        )
        if "what a memo" in last_assist or "explain what a memo" in last_assist:
            return ChatResponse(
                reply=_WHAT_IS_MEMO,
                citations=["Investor memo"],
                generator="fallback",
                fallback_reason="affirm_what_is_memo",
            )
        if "year stress" in last_assist:
            chunks = retrieve_chunks("how does year stress work", limit=1)
            return ChatResponse(
                reply=_fallback_reply("how does year stress work", req.memo, chunks),
                citations=[str(c.get("title") or c.get("id")) for c in chunks],
                generator="fallback",
                fallback_reason="affirm_stress",
            )

    # Greetings are in-scope even without product keywords.
    if _is_greeting(req.message):
        return ChatResponse(
            reply=_GREETING_REPLY,
            citations=[],
            generator="fallback",
            fallback_reason="greeting",
        )

    if not is_on_topic(req.message):
        return ChatResponse(
            reply=_OFFTOPIC_REFUSAL,
            citations=[],
            generator="fallback",
            fallback_reason="off_topic",
        )

    # Deterministic edge paths (work even when Gemini is up — consistent UX).
    has_memo = _has_usable_memo(req.memo)
    if _asks_what_is_memo(req.message):
        return ChatResponse(
            reply=_WHAT_IS_MEMO,
            citations=["Investor memo"],
            generator="fallback",
            fallback_reason="what_is_memo",
        )
    if _asks_explain_memo(req.message) and not has_memo:
        return ChatResponse(
            reply=_NO_MEMO_EXPLAIN,
            citations=[],
            generator="fallback",
            fallback_reason="no_memo",
        )
    if _asks_options_or_recommend(req.message) and not has_memo:
        return ChatResponse(
            reply=_NO_MEMO_OPTIONS,
            citations=["Option A vs Option B"],
            generator="fallback",
            fallback_reason="no_memo_options",
        )

    chunks = retrieve_chunks(req.message, limit=3)
    # Prefer memo handbook chunk when explaining with a live memo.
    if _asks_explain_memo(req.message) and has_memo:
        by_id = {c.get("id"): c for c in _load_handbook()}
        memo_chunk = by_id.get("memo")
        if memo_chunk and memo_chunk not in chunks:
            chunks = [memo_chunk, *chunks][:3]

    citations = [str(c.get("title") or c.get("id")) for c in chunks]
    user_prompt = _build_user_prompt(
        req.message,
        req.history,
        chunks,
        req.memo,
        req.briefs,
        req.synthesis,
        req.site,
    )

    key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not key:
        from app.agents.llm import refresh_dotenv

        refresh_dotenv()
        key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not key:
        return ChatResponse(
            reply=_fallback_reply(req.message, req.memo, chunks),
            citations=citations,
            generator="fallback",
            fallback_reason="no_api_key",
        )

    try:
        # Explain-with-memo: prefer deterministic numbers, Gemini can polish via prompt;
        # still call Gemini for richer wording when key exists.
        reply = _gemini_text(_SYSTEM, user_prompt, key)
        return ChatResponse(
            reply=reply,
            citations=citations,
            generator="gemini",
            fallback_reason=None,
        )
    except Exception as exc:
        reason = str(exc)
        if "RESOURCE_EXHAUSTED" in reason or "429" in reason:
            reason = "gemini_credits_depleted"
        else:
            reason = f"gemini_error: {reason.split('. ', 1)[0][:120]}"
        return ChatResponse(
            reply=_fallback_reply(req.message, req.memo, chunks),
            citations=citations,
            generator="fallback",
            fallback_reason=reason,
        )
