"use client";

import { MessageCircleQuestion, Send, Sparkles, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

import { useAiEnabled } from "@/lib/ai";
import { api, apiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Source = { n: number; title: string; kind: string };
type Turn = { q: string; a?: string; sources?: Source[]; error?: string };

const SUGGESTIONS = [
  "When is the next holiday?",
  "When are fees due?",
  "What homework is due this week?",
];

/** Floating "Ask the school" assistant, answering from school documents,
 *  notices and the calendar (RAG on the backend). Hidden when AI is off. */
export function AskAssistant() {
  const enabled = useAiEnabled();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  if (!enabled) return null;

  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 3 || busy) return;
    setQ("");
    setBusy(true);
    setTurns((t) => [...t, { q: text }]);
    try {
      const { data } = await api.post<{ answer: string; sources: Source[] }>(
        "/api/v1/ai/ask",
        { question: text },
        { timeout: 90_000 }
      );
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a: data.answer, sources: data.sources } : x)));
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: apiError(e) } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="print:hidden">
      {open && (
        <div className="fixed bottom-20 right-4 z-40 flex h-[32rem] max-h-[75vh] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-raised shadow-2xl">
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Sparkles className="h-4 w-4 text-brand-500" /> Ask the school
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-ink-subtle hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {turns.length === 0 && (
              <div className="space-y-2">
                <p className="text-ink-muted">
                  Answers come from school documents, notices and the holiday calendar.
                </p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="block w-full rounded-lg border border-surface-border px-3 py-2 text-left text-ink-muted hover:bg-surface-hover"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className="space-y-2">
                <div className="ml-8 rounded-xl bg-brand-500/15 px-3 py-2 text-ink">{t.q}</div>
                {t.a && (
                  <div className="mr-8 rounded-xl bg-surface-subtle px-3 py-2 text-ink">
                    <p className="whitespace-pre-line">{t.a}</p>
                    {!!t.sources?.length && (
                      <ul className="mt-2 space-y-0.5 border-t border-surface-border pt-2 text-xs text-ink-subtle">
                        {t.sources.map((s) => (
                          <li key={s.n}>
                            [{s.n}] {s.title} <span className="opacity-70">· {s.kind}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {t.error && <div className="mr-8 rounded-xl bg-rose-50 px-3 py-2 text-rose-700">{t.error}</div>}
                {!t.a && !t.error && <div className="mr-8 text-xs text-ink-subtle">Thinking…</div>}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              ask(q);
            }}
            className="flex items-center gap-2 border-t border-surface-border p-3"
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask a question…"
              maxLength={1000}
              className="flex-1 rounded-lg border border-surface-border bg-surface-subtle px-3 py-2 text-sm text-ink outline-none"
            />
            <button
              type="submit"
              disabled={busy || q.trim().length < 3}
              aria-label="Send"
              className="rounded-lg bg-brand-600 p-2 text-white disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Ask the school"
        className={cn(
          "fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-lg transition hover:scale-105"
        )}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircleQuestion className="h-5 w-5" />}
      </button>
    </div>
  );
}
