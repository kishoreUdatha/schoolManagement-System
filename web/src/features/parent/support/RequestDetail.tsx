"use client";

/*
 * PM-046 · Request detail. Status, owner and the thread of one request from
 * Help & requests, with a reply box and "Mark resolved":
 *  - ?ticket= an office help-desk request (GET/POST /parent/me/help-tickets/
 *    {id}, …/replies, …/resolve); opening it marks the office's replies read;
 *  - ?id= a conversation with a teacher (…/conversations/{id}/messages,
 *    …/mark-read, …/resolve). A new message reopens a resolved one.
 */

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { openAttachment } from "@/components/ui/Attachments";
import { api, errorText } from "@/lib/api";
import { date, dateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { requestStatus, ticketStatus } from "./HelpRequests";
import { ChildGate, PmEmpty, PmError, PmLoading } from "./pm";
import { ME, type Ticket } from "./services";
import type { Conversation, Message } from "./types";

export function RequestDetail() {
  const ticket = Number(useSearchParams().get("ticket")) || null;
  return <ChildGate>{ticket ? <TicketDetail id={ticket} /> : <Detail />}</ChildGate>;
}

function BackToRequests() {
  const { go } = useParent();
  return (
    <button className="action" onClick={() => go(44)}>
      Help & requests
    </button>
  );
}

function TicketDetail({ id }: { id: number }) {
  const { notify } = useParent();
  const t = useApi<Ticket>(`${ME}/help-tickets/${id}`);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (t.loading && !t.data) return <PmLoading />;
  if (!t.data) {
    return (
      <>
        <PmError>{t.error}</PmError>
        <BackToRequests />
      </>
    );
  }
  const k = t.data;
  const [text] = ticketStatus(k);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      notify(done);
      t.reload();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  function send(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    run(async () => {
      await api.post(`${ME}/help-tickets/${id}/replies`, { body: reply.trim() });
      setReply("");
    }, k.status === "resolved" ? "Request reopened." : "Reply sent.");
  }

  return (
    <>
      <span className={k.status === "resolved" ? "status" : "status amber"}>{text}</span>
      <h2>{k.subject}</h2>
      <dl>
        <div>
          <dt>Request</dt>
          <dd>#{k.id}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{k.category}</dd>
        </div>
        <div>
          <dt>Assigned to</dt>
          <dd>{k.assigned_to_name ?? "School office"}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{date(k.created_at)}</dd>
        </div>
      </dl>
      <PmError>{err}</PmError>
      {(k.replies ?? []).map((m) => (
        <div key={m.id} className={`bubble ${m.from_parent ? "sent" : "received"}`} style={{ whiteSpace: "pre-line" }}>
          {m.body}
          <small>
            {m.from_parent ? "You" : m.author_name ?? "School office"} · {dateTime(m.created_at)}
          </small>
        </div>
      ))}
      <form onSubmit={send}>
        <label className="field">
          {k.status === "resolved" ? "Need more help? Reply to reopen" : "Reply"}
          <textarea rows={3} placeholder="Add more details" value={reply} onChange={(e) => setReply(e.target.value)} required maxLength={5000} />
        </label>
        <button className="action" type="submit" disabled={busy || !reply.trim()}>
          {busy ? "Sending…" : "Send reply"}
        </button>
      </form>
      {k.status !== "resolved" ? (
        <button className="action secondary" disabled={busy} onClick={() => run(() => api.post(`${ME}/help-tickets/${id}/resolve`), "Marked resolved.")}>
          Mark resolved
        </button>
      ) : null}
    </>
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
        <BackToRequests />
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
      notify(conv?.is_closed ? "Conversation reopened." : "Reply sent.");
      msgs.reload();
      all.reload();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/v1/parent/me/conversations/${id}/resolve`);
      notify("Marked resolved.");
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
      <form onSubmit={send}>
        <label className="field">
          {conv.is_closed ? "Need more help? Reply to reopen" : "Reply"}
          <textarea rows={3} placeholder="Add more details" value={reply} onChange={(e) => setReply(e.target.value)} required maxLength={5000} />
        </label>
        <button className="action" type="submit" disabled={busy || !reply.trim()}>
          {busy ? "Sending…" : "Send reply"}
        </button>
      </form>
      {!conv.is_closed ? (
        <button className="action secondary" disabled={busy} onClick={resolve}>
          Mark resolved
        </button>
      ) : null}
    </>
  );
}
