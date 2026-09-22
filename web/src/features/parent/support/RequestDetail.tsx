"use client";

/*
 * PM-046 · Request detail (?id=conversation). Status, owner and the thread
 * of one request from Help & requests, with a reply box. Opening it marks
 * the teacher's replies as read.
 */

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { openAttachment } from "@/components/ui/Attachments";
import { api, errorText } from "@/lib/api";
import { date, dateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { requestStatus } from "./HelpRequests";
import { ChildGate, PmEmpty, PmError, PmLoading } from "./pm";
import type { Conversation, Message } from "./types";

export function RequestDetail() {
  return (
    <ChildGate>
      <Detail />
    </ChildGate>
  );
}

function Detail() {
  const { childId, go, notify } = useParent();
  const id = Number(useSearchParams().get("id")) || null;
  const all = useApi<Conversation[]>(id ? `/api/v1/parent/me/conversations` : null);
  const conv = (all.data ?? []).find((c) => c.id === id) ?? null;
  const ours = conv !== null && conv.student_id === childId;
  const msgs = useApi<Message[]>(ours ? `/api/v1/parent/me/conversations/${id}/messages` : null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const marked = useRef<number | null>(null);

  // Mark replies read once the thread has been shown.
  useEffect(() => {
    if (ours && conv && conv.unread_for_viewer > 0 && msgs.data && marked.current !== conv.id) {
      marked.current = conv.id;
      api.post(`/api/v1/parent/me/conversations/${conv.id}/mark-read`).catch(() => undefined);
    }
  }, [ours, conv, msgs.data]);

  if (!id) {
    return (
      <>
        <PmEmpty title="Choose a request first">Open a request from Help & requests.</PmEmpty>
        <button className="action" onClick={() => go(44)}>
          Help & requests
        </button>
      </>
    );
  }
  if (all.loading && !all.data) return <PmLoading />;
  if (!conv || !ours) {
    return (
      <>
        <PmError>{all.error}</PmError>
        {all.data ? <PmEmpty title="Request not found">It may belong to another child. Pick the child in the bar above, or open Help & requests.</PmEmpty> : null}
        <button className="action" onClick={() => go(44)}>
          Help & requests
        </button>
      </>
    );
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/v1/parent/me/conversations/${id}/messages`, { body: reply.trim() });
      setReply("");
      notify("Reply sent.");
      msgs.reload();
      all.reload();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  const [text] = requestStatus(conv);
  const first = msgs.data?.[0]?.body.split("\n")[0];

  return (
    <>
      <span className={conv.is_closed ? "status" : "status amber"}>{text}</span>
      <h2>{first ?? "Request"}</h2>
      <dl>
        <div>
          <dt>Request</dt>
          <dd>#{conv.id}</dd>
        </div>
        <div>
          <dt>Assigned to</dt>
          <dd>{conv.teacher_name ?? "Teacher"}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{date(conv.created_at)}</dd>
        </div>
      </dl>
      <PmError>{err || msgs.error}</PmError>
      {msgs.loading && !msgs.data ? <PmLoading /> : null}
      {(msgs.data ?? []).map((m) => {
        const mine = m.sender_role === "parent";
        return (
          <div key={m.id} className={`bubble ${mine ? "sent" : "received"}`} style={{ whiteSpace: "pre-line" }}>
            {m.body}
            {(m.files ?? []).map((a) => (
              <button
                key={a.id}
                type="button"
                className="text-button"
                style={{ display: "block" }}
                onClick={() => openAttachment(`/api/v1/parent/me/conversations/${conv.id}/messages/${m.id}/files/${a.id}`, a).catch((e) => setErr(errorText(e)))}
              >
                {`Attachment: ${a.file_name}`}
              </button>
            ))}
            <small>
              {mine ? "You" : m.sender_name ?? "School"} · {dateTime(m.created_at)}
            </small>
          </div>
        );
      })}
      {conv.is_closed ? (
        <p className="micro">This conversation is closed. Create a new request if you need more help.</p>
      ) : (
        <form onSubmit={send}>
          <label className="field">
            Reply
            <textarea rows={3} placeholder="Add more details" value={reply} onChange={(e) => setReply(e.target.value)} required maxLength={5000} />
          </label>
          <button className="action" type="submit" disabled={busy || !reply.trim()}>
            {busy ? "Sending…" : "Send reply"}
          </button>
        </form>
      )}
      {/* Not wired: "Mark resolved" — parents cannot close a conversation through the API. */}
    </>
  );
}
