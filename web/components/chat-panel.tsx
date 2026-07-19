"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { sendChatMessage } from "@/lib/api";
import type { AgentBrief, BossSynthesis, Memo } from "@/lib/types";

type Role = "user" | "assistant";

interface ChatMessage {
  role: Role;
  content: string;
  citations?: string[];
}

const SUGGESTIONS_WITH_MEMO = [
  "Explain this memo",
  "Why Option B?",
  "What are acres?",
  "How does year stress work?",
];

const SUGGESTIONS_NO_MEMO = [
  "What is a memo?",
  "How does year stress work?",
  "What are acres?",
  "What is Option A vs B?",
];

interface ChatPanelProps {
  memo: Memo | null;
  briefs: Record<string, AgentBrief> | null;
  synthesis: BossSynthesis | null;
  siteName?: string;
  siteLat?: number;
  siteLng?: number;
  /** Optional control (e.g. voice mic) sitting in the same dock. */
  dockExtra?: ReactNode;
}

export function ChatPanel({
  memo,
  briefs,
  synthesis,
  siteName,
  siteLat,
  siteLng,
  dockExtra,
}: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi - ask about your site, year stress, or Option A vs B. After you Run year stress I can explain your investor memo. If there is no memo yet, ask What is a memo?",
    },
  ]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const suggestions = memo ? SUGGESTIONS_WITH_MEMO : SUGGESTIONS_NO_MEMO;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setInput("");
      setMessages((m) => [...m, { role: "user", content: trimmed }]);
      setBusy(true);
      try {
        const history = messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content }));
        const res = await sendChatMessage({
          message: trimmed,
          history,
          memo: memo ?? undefined,
          briefs: briefs ?? undefined,
          synthesis: synthesis ?? undefined,
          site:
            siteLat != null && siteLng != null
              ? { name: siteName, lat: siteLat, lng: siteLng }
              : siteName
                ? { name: siteName }
                : undefined,
        });
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: res.reply,
            citations: res.citations,
          },
        ]);
      } catch {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              "Chat is unreachable right now. Check that the API is running on the same NEXT_PUBLIC_API_BASE.",
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, briefs, memo, messages, siteLat, siteLng, siteName, synthesis],
  );

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2">
      {open && (
        <div className="pointer-events-auto flex h-[min(380px,62vh)] w-[min(320px,calc(100vw-2rem))] flex-col overflow-hidden border border-panel-border bg-panel shadow-xl">
          <header className="flex items-center justify-between border-b border-panel-border px-3 py-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-soft">
                INN-SIGHT assistant
              </p>
              <p className="text-[10px] text-text-soft">
                {memo
                  ? "Memo loaded - ask me to explain it"
                  : "No memo yet - I can still explain what a memo is"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-1 text-[11px] text-text-soft hover:bg-panel-muted"
            >
              Close
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`px-2.5 py-2 text-[12px] leading-snug ${
                  m.role === "user"
                    ? "ml-6 bg-ink text-white"
                    : "mr-4 bg-panel-muted text-text-strong"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.citations && m.citations.length > 0 && (
                  <p className="mt-1 text-[9.5px] text-text-soft">
                    Refs: {m.citations.join(" · ")}
                  </p>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="flex flex-wrap gap-x-2 gap-y-1 border-t border-panel-border px-3 pt-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => void send(s)}
                className="text-[10px] text-text-soft underline-offset-2 hover:text-text-strong hover:underline disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>

          <form
            className="flex gap-1.5 border-t border-panel-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              placeholder="Ask about the memo or app…"
              className="min-w-0 flex-1 border border-panel-border bg-white px-2 py-1.5 text-[12px] outline-none focus:border-[#5B9BD5]"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="bg-ink px-3 py-1.5 text-[12px] font-semibold text-accent disabled:opacity-50"
            >
              {busy ? "…" : "Send"}
            </button>
          </form>
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-2">
        {dockExtra}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="border border-accent bg-ink px-3.5 py-2 text-[12px] font-semibold text-accent shadow-md hover:bg-ink-raised"
        >
          {open ? "Close chat" : "Ask INN-SIGHT"}
        </button>
      </div>
    </div>
  );
}
