"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { openAttachment, type Attachment } from "@/components/ui/Attachments";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime, initials } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useRole } from "./shared";

type Conversation = {
  id: number;
  parent_user_id: number;
  parent_name: string | null;
  teacher_user_id: number;
  teacher_name: string | null;
  student_id: number;
  student_name: string | null;
  last_message_at: string | null;
  last_message_body: string | null;
  unread_for_viewer: number;
  is_closed: boolean;
};
type Message = {
  id: number;
  sender_user_id: number | null;
  sender_name: string | null;
  sender_role: string | null;
  body: string;
  attachment_url: string | null;
  is_read_by_recipient: boolean;
  created_at: string;
  files?: Attachment[];
};
type Oversight = {
  rows: {
    conversation_id: number;
    parent_name: string | null;
    teacher_name: string | null;
    student_name: string | null;
    messages: number;
    last_message_at: string | null;
    teacher_unread: number;
    parent_unread: number;
    closed: boolean;
    awaiting_teacher: boolean;
  }[];
  count: number;
  awaiting_teacher: number;
  bodies_visible: boolean;
};
type Child = { id: number; full_name: string };
type Contact = { teacher_user_id: number; teacher_name: string; subjects: string[] };

const TONES = ["mint", "", "peach", "lilac"];
const convoStyle = (active: boolean) => ({ width: "100%", textAlign: "left" as const, background: active ? "#edf4ff" : "#fff" });

/** Page-head "New message", per role: a parent starts a thread; the office writes a notice. */
export function NewMessageAction() {
  const role = useRole();
  if (role === "parent") {
    return (
      <Link href={`${routeOf(253)}?new=1`} className="btn primary">
        <Icon name="plus" className="sm" />
        New message
      </Link>
    );
  }
  if (role === "school_admin") {
    return (
      <Link href={routeOf(254)} className="btn primary">
        <Icon name="plus" className="sm" />
        New message
      </Link>
    );
  }
  return null;
}

/** SCR-253: parents and teachers talk; the office sees who is talking, not what. */
export function MessagingInbox() {
  const role = useRole();
  if (role === null) return <Loading />;
  if (role === "teacher" || role === "parent") return <Conversations who={role} />;
  if (role === "school_admin" || role === "principal") return <OfficeOversight />;
  return <ErrorNote>Messaging is between parents and teachers.</ErrorNote>;
}

/**
 * Parent or teacher, live: GET {base}/conversations, GET/POST
 * {base}/conversations/{id}/messages, POST {base}/conversations/{id}/mark-read,
 * where base is /api/v1/teacher or /api/v1/parent/me. A parent starts a thread
 * with POST /parent/me/conversations; a teacher can close one (PATCH).
 * A sent message shows "Read" only when the API says the other side read it.
 */
function Conversations({ who }: { who: "teacher" | "parent" }) {
  const router = useRouter();
  const composing = useSearchParams().get("new") === "1" && who === "parent";
  const base = who === "teacher" ? "/api/v1/teacher" : "/api/v1/parent/me";
  const convos = useApi<Conversation[]>(`${base}/conversations`);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const list = convos.data ?? [];
  const active = list.find((c) => c.id === activeId) ?? (composing ? undefined : list[0]);
  const messages = useApi<Message[]>(active ? `${base}/conversations/${active.id}/messages` : null);

  // Opening a thread marks it read for this person.
  useEffect(() => {
    if (!active || !active.unread_for_viewer) return;
    api
      .post(`${base}/conversations/${active.id}/mark-read`)
      .then(() => convos.reload())
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  useEffect(() => bottom.current?.scrollIntoView({ block: "nearest" }), [messages.data]);

  const other = (c: Conversation) => (who === "teacher" ? c.parent_name : c.teacher_name) ?? "—";
  const q = search.trim().toLowerCase();
  const shown = list.filter((c) => !q || other(c).toLowerCase().includes(q) || (c.student_name ?? "").toLowerCase().includes(q));
  const num = (v: number) => (convos.data ? String(v) : "…");
  const weekAgo = Date.now() - 7 * 864e5;
  const stats = [
    { label: "Conversations", value: num(list.length), note: `${list.filter((c) => c.is_closed).length} closed` },
    { label: "Unread", value: num(list.filter((c) => c.unread_for_viewer).length), note: `${list.reduce((t, c) => t + c.unread_for_viewer, 0)} message(s)` },
    { label: "Active this week", value: num(list.filter((c) => c.last_message_at && new Date(c.last_message_at).getTime() >= weekAgo).length), note: "A message in the last 7 days" },
  ];

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!active || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api.post(`${base}/conversations/${active.id}/messages`, { body: draft.trim() });
      setDraft("");
      messages.reload();
      convos.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  async function toggleClosed() {
    if (!active) return;
    try {
      await api.patch(`/api/v1/teacher/conversations/${active.id}`, { closed: !active.is_closed });
      notify(active.is_closed ? "Conversation reopened." : "Conversation closed.");
      convos.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <section className="panel">
        <div className="message-layout">
          <aside className="message-list">
            <div style={{ padding: "16px" }}>
              <div className="searchbox">
                <Icon name="search" className="sm" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" />
              </div>
            </div>
            {shown.map((c, i) => (
              <button
                key={c.id}
                type="button"
                className={`conversation ${active?.id === c.id ? "active" : ""}`}
                style={convoStyle(active?.id === c.id)}
                onClick={() => {
                  setActiveId(c.id);
                  if (composing) router.replace(routeOf(253));
                }}
              >
                <span className={`avatar ${TONES[i % 4]}`}>{initials(other(c))}</span>
                <div>
                  <strong>
                    {other(c)}
                    {c.unread_for_viewer ? ` · ${c.unread_for_viewer} new` : ""}
                  </strong>
                  <p>{`About ${c.student_name ?? "—"}${c.last_message_body ? ` · ${c.last_message_body}` : ""}`}</p>
                </div>
              </button>
            ))}
            {!shown.length ? (
              <p className="muted small" style={{ padding: "0 16px 16px" }}>
                {convos.loading ? "Loading…" : list.length ? "No conversation matches." : who === "teacher" ? "No parent has written yet. Parents start a conversation from their portal." : "No conversations yet."}
              </p>
            ) : null}
          </aside>
          <div className="message-content">
            {composing ? (
              <NewConversation
                onDone={(id) => {
                  setActiveId(id);
                  convos.reload();
                  router.replace(routeOf(253));
                }}
              />
            ) : active ? (
              <>
                <div className="message-head">
                  <div className="person">
                    <span className="avatar mint">{initials(other(active))}</span>
                    <div>
                      {other(active)}
                      <small>{`${who === "teacher" ? "Parent" : "Teacher"} · about ${active.student_name ?? "—"}${active.is_closed ? " · closed" : ""}`}</small>
                    </div>
                  </div>
                  {who === "teacher" ? (
                    <button type="button" className="btn" onClick={toggleClosed}>
                      {active.is_closed ? "Reopen" : "Close conversation"}
                    </button>
                  ) : null}
                </div>
                <div className="messages">
                  <ErrorNote>{error ?? messages.error}</ErrorNote>
                  {(messages.data ?? []).map((m) => {
                    const mine = m.sender_role === who;
                    return (
                      <div key={m.id} className={`bubble ${mine ? "out" : ""}`} style={{ whiteSpace: "pre-line" }}>
                        {m.body}
                        {m.attachment_url ? (
                          <>
                            <br />
                            <a href={m.attachment_url} target="_blank" rel="noreferrer">
                              Attachment
                            </a>
                          </>
                        ) : null}
                        {(m.files ?? []).map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className="btn text"
                            style={{ display: "block", padding: 0 }}
                            onClick={() => openAttachment(`${base}/conversations/${active?.id}/messages/${m.id}/files/${a.id}`, a).catch((err) => setError(errorText(err)))}
                          >
                            {`Attachment: ${a.file_name}`}
                          </button>
                        ))}
                        <small>{`${dateTime(m.created_at)}${mine && m.is_read_by_recipient ? " · Read" : ""}`}</small>
                      </div>
                    );
                  })}
                  {messages.loading && !messages.data ? <p className="muted small">Loading…</p> : null}
                  <div ref={bottom} />
                </div>
                <form className="message-compose" onSubmit={send}>
                  <input
                    aria-label="Write a message"
                    placeholder={active.is_closed ? "This conversation is closed" : "Write a message…"}
                    required
                    value={draft}
                    disabled={active.is_closed}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button className="btn primary" type="submit" disabled={sending || active.is_closed}>
                    {sending ? "Sending…" : "Send message"}
                  </button>
                </form>
              </>
            ) : (
              <div className="panel-pad muted">
                <ErrorNote>{convos.error}</ErrorNote>
                {who === "parent" ? "Choose a conversation, or start a new message to one of your child’s teachers." : "Choose a conversation."}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

/** Parent starts a thread: GET /parent/me/children, /children/{id}/teacher-contacts; POST /parent/me/conversations. */
function NewConversation({ onDone }: { onDone: (id: number) => void }) {
  const kids = useApi<Child[]>("/api/v1/parent/me/children");
  const [childId, setChildId] = useState("");
  const child = childId || (kids.data?.[0] ? String(kids.data[0].id) : "");
  const contacts = useApi<Contact[]>(child ? `/api/v1/parent/me/children/${child}/teacher-contacts` : null);
  const [teacherId, setTeacherId] = useState("");
  const teacher = teacherId || (contacts.data?.[0] ? String(contacts.data[0].teacher_user_id) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = String(new FormData(e.currentTarget).get("body") ?? "").trim();
    if (!child || !teacher || !body) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<{ id: number }>("/api/v1/parent/me/conversations", { teacher_user_id: Number(teacher), student_id: Number(child), body });
      notify("Message sent to the teacher.");
      onDone(r.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel-pad" onSubmit={submit}>
      <h3 style={{ marginBottom: 12 }}>New message</h3>
      <ErrorNote>{error ?? kids.error ?? contacts.error}</ErrorNote>
      <div className="form-grid">
        <label className="field">
          <span>
            Child<span className="req">*</span>
          </span>
          <select
            value={child}
            required
            onChange={(e) => {
              setChildId(e.target.value);
              setTeacherId("");
            }}
          >
            {(kids.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            Teacher<span className="req">*</span>
          </span>
          <select value={teacher} required onChange={(e) => setTeacherId(e.target.value)}>
            {!contacts.data?.length ? <option value="">{contacts.loading ? "Loading…" : "No teacher found"}</option> : null}
            {(contacts.data ?? []).map((c) => (
              <option key={c.teacher_user_id} value={c.teacher_user_id}>
                {c.subjects.length ? `${c.teacher_name} (${c.subjects.join(", ")})` : c.teacher_name}
              </option>
            ))}
          </select>
        </label>
        <label className="field full">
          <span>
            Message<span className="req">*</span>
          </span>
          <textarea name="body" required placeholder="Write a message…" />
        </label>
      </div>
      <div className="gap" />
      <button type="submit" className="btn primary" disabled={saving || !teacher}>
        {saving ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}

/**
 * Office and principal, live: GET /api/v1/school/event-ops/conversations.
 * Who is talking and whether a parent is waiting — never what was said:
 * the office is not a participant, and the API returns no message bodies.
 */
function OfficeOversight() {
  const res = useApi<Oversight>("/api/v1/school/event-ops/conversations");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const rows = res.data?.rows ?? [];
  const q = search.trim().toLowerCase();
  const shown = rows.filter((c) => !q || [c.parent_name, c.teacher_name, c.student_name].some((x) => (x ?? "").toLowerCase().includes(q)));
  const active = rows.find((c) => c.conversation_id === activeId) ?? shown[0];
  const num = (v: number) => (res.data ? String(v) : "…");
  const stats = [
    { label: "Conversations", value: num(res.data?.count ?? 0), note: `${rows.filter((c) => c.closed).length} closed` },
    { label: "Awaiting teacher", value: num(res.data?.awaiting_teacher ?? 0), note: "A parent is waiting for a reply" },
    { label: "Unread by teachers", value: num(rows.reduce((t, c) => t + c.teacher_unread, 0)), note: "Messages" },
    { label: "Unread by parents", value: num(rows.reduce((t, c) => t + c.parent_unread, 0)), note: "Messages" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <section className="panel">
        <div className="message-layout">
          <aside className="message-list">
            <div style={{ padding: "16px" }}>
              <div className="searchbox">
                <Icon name="search" className="sm" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" />
              </div>
              {res.data ? <p className="muted small" style={{ marginTop: 10 }}>{`${res.data.count} conversation(s) · ${res.data.awaiting_teacher} waiting on a teacher`}</p> : null}
            </div>
            {shown.map((c, i) => (
              <button
                key={c.conversation_id}
                type="button"
                className={`conversation ${active?.conversation_id === c.conversation_id ? "active" : ""}`}
                style={convoStyle(active?.conversation_id === c.conversation_id)}
                onClick={() => setActiveId(c.conversation_id)}
              >
                <span className={`avatar ${TONES[i % 4]}`}>{initials(c.parent_name ?? "?")}</span>
                <div>
                  <strong>{`${c.parent_name ?? "—"} ↔ ${c.teacher_name ?? "—"}`}</strong>
                  <p>{`About ${c.student_name ?? "—"} · ${c.messages} message(s)`}</p>
                </div>
              </button>
            ))}
            {!shown.length ? <p className="muted small" style={{ padding: "0 16px 16px" }}>{res.loading ? "Loading…" : "Nobody has started a conversation yet."}</p> : null}
          </aside>
          <div className="message-content">
            {active ? (
              <>
                <div className="message-head">
                  <div className="person">
                    <span className="avatar mint">{initials(active.parent_name ?? "?")}</span>
                    <div>
                      {`${active.parent_name ?? "—"} and ${active.teacher_name ?? "—"}`}
                      <small>{`About ${active.student_name ?? "—"}`}</small>
                    </div>
                  </div>
                  <Badge>{active.closed ? "Closed" : active.awaiting_teacher ? "Pending reply" : "Up to date"}</Badge>
                </div>
                <div className="messages">
                  <div className="tip">
                    <Icon name="shield" className="sm" />
                    <span>Who is talking, not what was said. This conversation is between a parent and a teacher; the office is not a participant, so the messages are not shown here.</span>
                  </div>
                  <dl className="kv" style={{ marginTop: 16 }}>
                    <div>
                      <dt>Messages</dt>
                      <dd>{active.messages}</dd>
                    </div>
                    <div>
                      <dt>Last message</dt>
                      <dd>{active.last_message_at ? dateTime(active.last_message_at) : "—"}</dd>
                    </div>
                    <div>
                      <dt>Unread by the teacher</dt>
                      <dd>{active.teacher_unread}</dd>
                    </div>
                    <div>
                      <dt>Unread by the parent</dt>
                      <dd>{active.parent_unread}</dd>
                    </div>
                  </dl>
                </div>
                <div className="message-compose">
                  <span className="muted small">Conversations are started by a parent or a teacher. To write to families, send a notice.</span>
                  <Link href={routeOf(254)} className="btn primary">
                    Write a notice
                  </Link>
                </div>
              </>
            ) : (
              <div className="panel-pad muted">
                <ErrorNote>{res.error}</ErrorNote>
                No conversation to show.
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
