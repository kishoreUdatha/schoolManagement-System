"use client";

/*
 * PM-035 · Inbox and PM-036 · Conversation. Conversations are per parent and
 * per child; these screens show only the selected child's. A new
 * conversation starts with one of the child's teachers
 * (GET …/teacher-contacts), created by the first message.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { initialsOf, useParent } from "@/components/parent/ParentShell";
import { openAttachment, type Attachment } from "@/components/ui/Attachments";
import { api, errorText } from "@/lib/api";
import { date, dateTime } from "@/lib/format";
import { parentRoute } from "@/lib/parentScreens";
import { useApi } from "@/lib/useApi";
import { PmEmpty, PmError, PmLoading, useEvery, useGoTo, useQueryId } from "./ui";

export type Conversation = {
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
  created_at: string;
};

export type Message = {
  id: number;
  conversation_id: number;
  sender_user_id: number | null;
  sender_name: string | null;
  sender_role: string | null;
  body: string;
  attachment_url: string | null;
  is_read_by_recipient: boolean;
  created_at: string;
  files?: Attachment[];
};

type TeacherContact = { teacher_user_id: number; teacher_name: string; subjects: string[] };

const CONVS = "/api/v1/parent/me/conversations";

const Chevron = () => (
  <span className="v-icon neutral mini">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  </span>
);

const PersonIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="7" r="4" />
    <path d="M4 22v-4c0-7 16-7 16 0v4z" opacity=".7" />
  </svg>
);

export function Inbox() {
  const { childId } = useParent();
  const goTo = useGoTo();
  const convs = useApi<Conversation[]>(CONVS);
  const teachers = useApi<TeacherContact[]>(childId ? `/api/v1/parent/me/children/${childId}/teacher-contacts` : null);

  if (!childId || (convs.loading && !convs.data)) return <PmLoading />;
  const mine = (convs.data ?? []).filter((c) => c.student_id === childId);
  const talking = new Set(mine.map((c) => c.teacher_user_id));
  const others = teachers.loading ? [] : (teachers.data ?? []).filter((t) => !talking.has(t.teacher_user_id));

  return (
    <>
      <p className="list-intro">Your conversations with school</p>
      <PmError>{convs.error}</PmError>
      {mine.length ? (
        <div className="row-group inbox-list">
          {mine.map((c, i) => (
            <button key={c.id} className="v-row" onClick={() => goTo(36, { id: c.id })}>
              <span className={`v-icon ${["blue", "purple", "green"][i % 3]}`}>
                <PersonIcon />
              </span>
              <span className="v-row-copy">
                <strong>{c.teacher_name ?? "Teacher"}</strong>
                <small>{`${c.last_message_at ? `${date(c.last_message_at)} · ` : ""}${c.last_message_body ?? "No messages yet"}${c.is_closed ? " · closed" : ""}`}</small>
              </span>
              <span className="v-row-value">{c.unread_for_viewer ? c.unread_for_viewer : ""}</span>
              <Chevron />
            </button>
          ))}
        </div>
      ) : !convs.error ? (
        <p className="muted">No conversations about this child yet.</p>
      ) : null}
      {others.length ? (
        <>
          <div className="section-head">
            <h3>Message a teacher</h3>
          </div>
          <div className="row-group inbox-list">
            {others.map((t) => (
              <button key={t.teacher_user_id} className="v-row" onClick={() => goTo(36, { teacher: t.teacher_user_id })}>
                <span className="v-icon slate">
                  <PersonIcon />
                </span>
                <span className="v-row-copy">
                  <strong>{t.teacher_name}</strong>
                  <small>{t.subjects.join(", ") || "Teacher"}</small>
                </span>
                <span className="v-row-value">New</span>
                <Chevron />
              </button>
            ))}
          </div>
        </>
      ) : null}
      {/* Not wired: school communication hours — no endpoint provides them. */}
      <button className="action secondary" onClick={() => goTo(45)}>
        Contact school office
      </button>
    </>
  );
}

export function ConversationView() {
  const { childId, child, notify } = useParent();
  const goTo = useGoTo();
  const router = useRouter();
  const convId = useQueryId("id");
  const teacherId = useQueryId("teacher");
  const convs = useApi<Conversation[]>(CONVS);
  const teachers = useApi<TeacherContact[]>(childId && !convId ? `/api/v1/parent/me/children/${childId}/teacher-contacts` : null);

  // An existing conversation, by ?id= or by (teacher, selected child).
  const conv = (convs.data ?? []).find((c) => (convId ? c.id === convId : c.teacher_user_id === teacherId && c.student_id === childId)) ?? null;
  const msgs = useApi<Message[]>(conv ? `${CONVS}/${conv.id}/messages` : null);
  useEvery(20_000, msgs.reload, Boolean(conv));

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const markedFor = useRef<number | null>(null);

  // Opening a conversation marks the teacher's messages read.
  useEffect(() => {
    if (!conv || !conv.unread_for_viewer || markedFor.current === conv.id) return;
    markedFor.current = conv.id;
    api.post(`${CONVS}/${conv.id}/mark-read`).catch(() => undefined);
  }, [conv]);

  if (!childId || (convs.loading && !convs.data)) return <PmLoading />;
  if (convs.error) return <PmError>{convs.error}</PmError>;

  if (conv && conv.student_id !== childId)
    return (
      <>
        <PmEmpty title="Another child’s conversation">{`This conversation is about ${conv.student_name ?? "another child"}. Switch child to read it.`}</PmEmpty>
        <button className="action secondary" onClick={() => goTo(35)}>
          Back to inbox
        </button>
      </>
    );

  const teacher = conv ? { name: conv.teacher_name ?? "Teacher", sub: conv.student_name ?? "" } : (() => {
    const t = teachers.data?.find((x) => x.teacher_user_id === teacherId);
    return t ? { name: t.teacher_name, sub: t.subjects.join(", ") } : null;
  })();

  if (!conv && !teacher)
    return teachers.loading ? (
      <PmLoading />
    ) : (
      <>
        <PmEmpty title="Conversation not found">Pick a conversation or a teacher from the inbox.</PmEmpty>
        <button className="action secondary" onClick={() => goTo(35)}>
          Back to inbox
        </button>
      </>
    );

  async function send() {
    const body = text.trim();
    if (!body || busy || !childId) return;
    setBusy(true);
    setError(null);
    try {
      if (conv) {
        await api.post<Message>(`${CONVS}/${conv.id}/messages`, { body, attachment_url: null });
        msgs.reload();
        convs.reload();
      } else if (teacherId) {
        const c = await api.post<Conversation>(CONVS, { teacher_user_id: teacherId, student_id: childId, body, attachment_url: null });
        convs.reload();
        router.replace(`${parentRoute(36)}?id=${c.id}`);
      }
      setText("");
      notify("Message sent.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  let lastDay = "";
  return (
    <>
      <div className="chat-person">
        <span className="avatar small">{initialsOf(teacher!.name)}</span>
        <span>
          <b>{teacher!.name}</b>
          <small>{teacher!.sub || child?.section_label || ""}</small>
        </span>
      </div>
      {conv && msgs.loading && !msgs.data ? <PmLoading /> : null}
      <PmError>{msgs.error}</PmError>
      {conv
        ? (msgs.data ?? []).map((m) => {
            const day = date(m.created_at);
            const head = day !== lastDay ? <div className="chat-day">{day}</div> : null;
            lastDay = day;
            const sent = m.sender_role === "parent";
            return (
              <div key={m.id}>
                {head}
                <div className={`bubble ${sent ? "sent" : "received"}`}>
                  {m.body}
                  {m.attachment_url && /^(https?:\/\/|\/)/i.test(m.attachment_url) ? (
                    <>
                      {" "}
                      <a href={m.attachment_url} target="_blank" rel="noopener noreferrer">
                        Attachment
                      </a>
                    </>
                  ) : null}
                  {(m.files ?? []).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="text-button"
                      style={{ display: "block" }}
                      onClick={() => openAttachment(`${CONVS}/${m.conversation_id}/messages/${m.id}/files/${a.id}`, a).catch((err) => setError(errorText(err)))}
                    >
                      {`Attachment: ${a.file_name}`}
                    </button>
                  ))}
                  <small>{`${dateTime(m.created_at)}${sent && m.is_read_by_recipient ? " · Read" : ""}`}</small>
                </div>
              </div>
            );
          })
        : <p className="muted">{`Start a conversation with ${teacher!.name} about ${child?.full_name ?? "your child"}.`}</p>}
      <PmError>{error}</PmError>
      {conv?.is_closed ? (
        <p className="micro">This conversation has been closed by the school.</p>
      ) : (
        <>
          <label className="field">
            Message
            <textarea rows={2} placeholder="Write to the teacher" value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} />
          </label>
          <button className="action" disabled={busy || !text.trim()} onClick={send}>
            {busy ? "Sending…" : "Send message"}
          </button>
        </>
      )}
    </>
  );
}
