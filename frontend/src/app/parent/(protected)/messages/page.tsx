"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

type Conversation = {
  id: number;
  teacher_user_id: number;
  teacher_name: string | null;
  student_id: number;
  student_name: string | null;
  last_message_at: string | null;
  last_message_body: string | null;
  unread_for_viewer: number;
};

type Message = {
  id: number;
  conversation_id: number;
  sender_user_id: number | null;
  sender_name: string | null;
  sender_role: string | null;
  body: string;
  created_at: string;
};

type Child = { id: number; full_name: string };
type TeacherContact = {
  teacher_user_id: number;
  teacher_name: string;
  subjects: string[];
};

export default function ParentMessagesPage() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadConvs() {
    try {
      const { data } = await api.get<Conversation[]>(
        "/api/v1/parent/me/conversations"
      );
      setConvs(data);
      if (activeId == null && data.length > 0) {
        setActiveId(data[0].id);
      }
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
      .get<Message[]>(`/api/v1/parent/me/conversations/${activeId}/messages`)
      .then((r) => {
        setMessages(r.data);
        setTimeout(() => bottomRef.current?.scrollIntoView(), 0);
      })
      .catch((e) => setError(apiError(e)));
    api.post(`/api/v1/parent/me/conversations/${activeId}/mark-read`).catch(() => {});
  }, [activeId]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!activeId || !draft.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/v1/parent/me/conversations/${activeId}/messages`, {
        body: draft.trim(),
      });
      setDraft("");
      const r = await api.get<Message[]>(
        `/api/v1/parent/me/conversations/${activeId}/messages`
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
      <div className="flex items-end justify-between">
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Messages</h1>
        <Button onClick={() => setShowCompose(true)}>New conversation</Button>
      </div>
      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardBody className="p-0">
            {convs.length === 0 ? (
              <p className="p-3 text-sm text-ink-muted">No conversations yet.</p>
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
                          {c.teacher_name}
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
                Pick a conversation, or start a new one.
              </p>
            ) : (
              <>
                <div className="border-b border-surface-border px-3 py-2 text-sm">
                  <div className="font-medium text-ink">{active.teacher_name}</div>
                  <div className="text-xs text-ink-subtle">
                    about {active.student_name}
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-auto p-3" style={{ minHeight: 280 }}>
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={
                        "max-w-[80%] rounded-lg px-3 py-2 text-sm " +
                        (m.sender_role === "parent"
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
                    placeholder="Type a message…"
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

      {showCompose && (
        <ComposeNew
          onClose={() => setShowCompose(false)}
          onDone={(id) => {
            setShowCompose(false);
            setActiveId(id);
            loadConvs();
          }}
        />
      )}
    </div>
  );
}

function ComposeNew({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (convId: number) => void;
}) {
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<number | "">("");
  const [contacts, setContacts] = useState<TeacherContact[]>([]);
  const [teacherId, setTeacherId] = useState<number | "">("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ children: Child[] }>("/api/v1/parent/me/children")
      .then((r) => {
        setChildren(r.data.children);
        if (r.data.children.length > 0) setChildId(r.data.children[0].id);
      })
      .catch((e) => setError(apiError(e)));
  }, []);

  useEffect(() => {
    if (childId === "") return;
    api
      .get<TeacherContact[]>(
        `/api/v1/parent/me/children/${childId}/teacher-contacts`
      )
      .then((r) => {
        setContacts(r.data);
        setTeacherId(r.data[0]?.teacher_user_id ?? "");
      })
      .catch((e) => setError(apiError(e)));
  }, [childId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!childId || !teacherId || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post<{ id: number }>(
        "/api/v1/parent/me/conversations",
        {
          teacher_user_id: teacherId,
          student_id: childId,
          body: body.trim(),
        }
      );
      onDone(data.id);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-surface-border bg-surface-raised p-4">
        <h3 className="text-base font-semibold text-ink">New conversation</h3>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
            <span className="text-ink-muted">Child</span>
            <select
              value={childId}
              onChange={(e) =>
                setChildId(e.target.value ? Number(e.target.value) : "")
              }
              className="rounded-md border border-surface-border bg-surface-subtle px-3 py-1.5 text-ink"
              required
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
            <span className="text-ink-muted">Teacher</span>
            <select
              value={teacherId}
              onChange={(e) =>
                setTeacherId(e.target.value ? Number(e.target.value) : "")
              }
              className="rounded-md border border-surface-border bg-surface-subtle px-3 py-1.5 text-ink"
              required
            >
              {contacts.map((c) => (
                <option key={c.teacher_user_id} value={c.teacher_user_id}>
                  {c.teacher_name} ({c.subjects.join(", ")})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
            <span className="text-ink-muted">Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              required
              className="rounded-md border border-surface-border bg-surface-subtle px-3 py-2 text-ink"
            />
          </label>
          {error && (
            <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Send
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
