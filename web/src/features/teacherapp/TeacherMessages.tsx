"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTeacherApp } from "@/components/teacherapp/TeacherShell";
import { api, errorText } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { dayLabel, PmEmpty, PmError, PmLoading, todayIso } from "./parts";

type Conversation = {
  id: number;
  parent_user_id: number;
  parent_name: string | null;
  student_id: number | null;
  student_name: string | null;
  last_message_at: string | null;
  last_message_body: string | null;
  unread_for_viewer: number;
  is_closed: boolean;
  created_at: string;
};
type Message = {
  id: number;
  sender_user_id: number;
  sender_name: string | null;
  sender_role: string | null;
  body: string;
  attachment_url: string | null;
  created_at: string;
  files: { id: number; file_name: string }[];
};

const CONVERSATIONS = "/api/v1/teacher/conversations";

/** "10:42" today, "Thu 24 Sep" otherwise. */
function stamp(iso: string | null): string {
  if (!iso) return "";
  const local = new Date(iso);
  const d = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
  return d === todayIso() ? local.toTimeString().slice(0, 5) : dayLabel(d);
}

/** TM-012. Parents' threads with me, unread first. Parents start a thread; I answer. */
export function TeacherMessages() {
  const { go } = useTeacherApp();
  const [closed, setClosed] = useState(false);
  const convs = useApi<Conversation[]>(CONVERSATIONS, { include_closed: closed });
  const list = [...(convs.data ?? [])].sort(
    (a, b) => Number(b.unread_for_viewer > 0) - Number(a.unread_for_viewer > 0) || (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at),
  );

  return (
    <>
      <div className="chip-row">
        <button className={!closed ? "on" : ""} onClick={() => setClosed(false)}>
          Open
        </button>
        <button className={closed ? "on" : ""} onClick={() => setClosed(true)}>
          Include closed
        </button>
      </div>
      <PmError>{convs.error}</PmError>
      {convs.loading && !convs.data ? <PmLoading /> : null}
      {convs.data && !list.length ? <PmEmpty title="No messages">When a parent writes to you, the thread shows here.</PmEmpty> : null}
      {list.length ? (
        <div className="panel">
          {list.map((c) => (
            <button className="item" key={c.id} onClick={() => go(13, `id=${c.id}`)}>
              <span style={{ minWidth: 0 }}>
                <strong>{`${c.parent_name ?? "Parent"}${c.student_name ? ` · ${c.student_name}` : ""}`}</strong>
                <small className="muted" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.last_message_body ?? "No messages yet"}
                </small>
                {c.unread_for_viewer > 0 ? <span className="status blue">{`${c.unread_for_viewer} new`}</span> : null}
                {c.is_closed ? <span className="status amber">Closed</span> : null}
              </span>
              <small className="muted" style={{ flex: "none" }}>{stamp(c.last_message_at)}</small>
            </button>
          ))}
        </div>
      ) : null}
      <p className="micro">Parents start conversations from their app; you can reply to and close them here.</p>
    </>
  );
}

/** TM-013. One thread: read it (marks it read), reply, close or reopen. */
export function TeacherConversation() {
  const { notify } = useTeacherApp();
  const me = useSession()?.user;
  const id = Number(useSearchParams().get("id"));
  const convs = useApi<Conversation[]>(id ? CONVERSATIONS : null, { include_closed: true });
  const msgs = useApi<Message[]>(id ? `${CONVERSATIONS}/${id}/messages` : null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const c = convs.data?.find((x) => x.id === id);

  useEffect(() => {
    if (!id || !msgs.data) return;
    api.post(`${CONVERSATIONS}/${id}/mark-read`).catch(() => undefined);
    end.current?.scrollIntoView({ block: "end" });
  }, [id, msgs.data]);

  if (!id) return <PmEmpty title="Pick a conversation">Open one from Messages.</PmEmpty>;
  if (msgs.loading && !msgs.data) return <PmLoading />;
  if (msgs.error) return <PmError>{msgs.error}</PmError>;

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`${CONVERSATIONS}/${id}/messages`, { body: text });
      setBody("");
      msgs.reload();
      convs.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function setClosed(closed: boolean) {
    setError(null);
    try {
      await api.patch(`${CONVERSATIONS}/${id}`, { closed });
      notify(closed ? "Conversation closed." : "Conversation reopened.");
      convs.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      {c ? (
        <div className="panel soft between">
          <span>
            <strong>{c.parent_name ?? "Parent"}</strong>
            <small className="muted" style={{ display: "block" }}>{c.student_name ? `About ${c.student_name}` : "General"}</small>
          </span>
          <button className="text-button blue-text" onClick={() => setClosed(!c.is_closed)}>
            {c.is_closed ? "Reopen" : "Close"}
          </button>
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 8, margin: "10px 0" }}>
        {(msgs.data ?? []).map((m) => {
          const mine = m.sender_user_id === me?.id;
          return (
            <div
              key={m.id}
              style={{
                justifySelf: mine ? "end" : "start",
                maxWidth: "85%",
                background: mine ? "#e3ebff" : "#fff",
                border: "1px solid #dbe4f3",
                borderRadius: 14,
                padding: "8px 12px",
              }}
            >
              {!mine ? <small className="muted" style={{ display: "block", fontWeight: 700 }}>{m.sender_name ?? "Parent"}</small> : null}
              <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.body}</span>
              {m.files.map((f) => (
                <button key={f.id} className="text-button blue-text" style={{ display: "block" }} onClick={() => api.open(`${CONVERSATIONS}/${id}/messages/${m.id}/files/${f.id}`)}>
                  {`📎 ${f.file_name}`}
                </button>
              ))}
              {m.attachment_url ? (
                <a className="blue-text" style={{ display: "block" }} href={m.attachment_url} target="_blank" rel="noreferrer">
                  📎 Link
                </a>
              ) : null}
              <small className="muted" style={{ display: "block", textAlign: "right", fontSize: 11 }}>{stamp(m.created_at)}</small>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {error ? <p className="micro bad" role="alert">{error}</p> : null}
      {c?.is_closed ? (
        <p className="status amber" style={{ display: "block", whiteSpace: "normal" }}>This conversation is closed. Reopen it to reply.</p>
      ) : (
        <form className="sticky-save" onSubmit={send}>
          <label className="field" style={{ margin: 0 }}>
            <span className="micro">Reply</span>
            <textarea rows={2} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} placeholder="Write to the parent…" />
          </label>
          <button className="action" type="submit" disabled={busy || !body.trim()}>
            {busy ? "Sending…" : "Send"}
          </button>
        </form>
      )}
    </>
  );
}
