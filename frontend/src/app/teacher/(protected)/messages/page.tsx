"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type Conversation = {
  id: number;
  parent_name: string | null;
  student_id: number;
  student_name: string | null;
  last_message_at: string | null;
  last_message_body: string | null;
  unread_for_viewer: number;
};

type Message = {
  id: number;
  sender_role: string | null;
  body: string;
  created_at: string;
};

export default function TeacherMessagesPage() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadConvs() {
    try {
      const { data } = await api.get<Conversation[]>(
        "/api/v1/teacher/conversations"
      );
      setConvs(data);
      if (activeId == null && data.length > 0) setActiveId(data[0].id);
    } catch (e) {
      setError(apiError(e));
    }
  }
  useEffect(() => {
    loadConvs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId == null) return;
    api
      .get<Message[]>(`/api/v1/teacher/conversations/${activeId}/messages`)
      .then((r) => {
        setMessages(r.data);
        setTimeout(() => bottomRef.current?.scrollIntoView(), 0);
      })
      .catch((e) => setError(apiError(e)));
    api.post(`/api/v1/teacher/conversations/${activeId}/mark-read`).catch(() => {});
  }, [activeId]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!activeId || !draft.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/v1/teacher/conversations/${activeId}/messages`, {
        body: draft.trim(),
      });
      setDraft("");
      const r = await api.get<Message[]>(
        `/api/v1/teacher/conversations/${activeId}/messages`
      );
      setMessages(r.data);
      loadConvs();
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSending(false);
    }
  }

  const active = convs.find((c) => c.id === activeId);

  return (
    <div className="space-y-4">
      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Parent messages</h1>
      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardBody className="p-0">
            {convs.length === 0 ? (
              <p className="p-3 text-sm text-ink-muted">
                No parent conversations yet. Parents start the thread from their portal.
              </p>
            ) : (
              <ul className="divide-y divide-surface-border">
                {convs.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      className={
                        "block w-full px-3 py-2 text-left text-sm " +
                        (activeId === c.id
                          ? "bg-surface-hover"
                          : "hover:bg-surface-hover")
                      }
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-ink">
                          {c.parent_name}
                        </span>
                        {c.unread_for_viewer > 0 && (
                          <Badge tone="rose">{c.unread_for_viewer}</Badge>
                        )}
                      </div>
                      <div className="text-xs text-ink-subtle">
                        about {c.student_name}
                      </div>
                      {c.last_message_body && (
                        <div className="mt-1 line-clamp-1 text-xs text-ink-muted">
                          {c.last_message_body}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="flex flex-col">
          <CardBody className="flex flex-1 flex-col p-0">
            {!active ? (
              <p className="p-4 text-sm text-ink-muted">
                Pick a conversation.
              </p>
            ) : (
              <>
                <div className="border-b border-surface-border px-3 py-2 text-sm">
                  <div className="font-medium text-ink">{active.parent_name}</div>
                  <div className="text-xs text-ink-subtle">
                    parent of {active.student_name}
                  </div>
                </div>
                <div
                  className="flex-1 space-y-2 overflow-auto p-3"
                  style={{ minHeight: 280 }}
                >
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={
                        "max-w-[80%] rounded-lg px-3 py-2 text-sm " +
                        (m.sender_role === "teacher"
                          ? "ml-auto bg-brand-500/15 text-ink"
                          : "bg-surface-subtle text-ink")
                      }
                    >
                      <div className="whitespace-pre-line">{m.body}</div>
                      <div className="mt-1 text-[10px] text-ink-subtle">
                        {new Date(m.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
                <form
                  onSubmit={send}
                  className="flex gap-2 border-t border-surface-border p-2"
                >
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type a reply…"
                    className="flex-1 rounded-md border border-surface-border bg-surface-subtle px-3 py-1.5 text-sm text-ink"
                  />
                  <Button type="submit" loading={sending}>
                    Send
                  </Button>
                </form>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
