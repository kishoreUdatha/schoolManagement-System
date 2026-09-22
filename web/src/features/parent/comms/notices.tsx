"use client";

/*
 * PM-033 · Notice board and PM-034 · Notice detail, from the parent's notice
 * inbox (GET /parent/me/notices). Notices are addressed to the parent, not to
 * one child, so these lists do not change with the child bar.
 */

import { useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date, dateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { PmEmpty, PmError, PmLoading, useGoTo, useQueryId } from "./ui";

export type InboxNotice = {
  recipient_id: number;
  notice_id: number;
  title: string;
  body: string;
  attachment_url: string | null;
  sent_at: string | null;
  read_at: string | null;
  status: string;
};

const NOTICES = "/api/v1/parent/me/notices";
const COLORS = ["blue", "purple", "green", "amber"];

const Chevron = () => (
  <span className="v-icon neutral mini">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  </span>
);

export function NoticeBoard() {
  const goTo = useGoTo();
  const [unread, setUnread] = useState(false);
  const list = useApi<InboxNotice[]>(NOTICES, { unread_only: unread || undefined, limit: 100 });

  return (
    <>
      <div className="notice-feature">
        <span className="status blue">School office</span>
        <h2>Stay in the loop.</h2>
        <p>Announcements for your child’s school day.</p>
      </div>
      {/* Not wired: category filter — notices carry no category. Filter by read state instead. */}
      <label className="field">
        Show
        <select value={unread ? "unread" : "all"} onChange={(e) => setUnread(e.target.value === "unread")}>
          <option value="all">All notices</option>
          <option value="unread">Unread only</option>
        </select>
      </label>
      <PmError>{list.error}</PmError>
      {list.loading && !list.data ? <PmLoading /> : null}
      {list.data && !list.data.length ? <PmEmpty title={unread ? "All caught up" : "No notices yet"}>{unread ? "You have read every notice." : "School announcements will appear here."}</PmEmpty> : null}
      {list.data?.length ? (
        <div className="row-group">
          {list.data.map((n, i) => (
            <button key={n.recipient_id} className="v-row" onClick={() => goTo(34, { id: n.recipient_id })}>
              <span className={`v-icon ${COLORS[i % COLORS.length]}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 2h14v21l-3-2-4 2-4-2-3 2z" />
                  <path d="M8 7h8M8 11h8M8 15h4" className="cut" />
                </svg>
              </span>
              <span className="v-row-copy">
                <strong>{n.title}</strong>
                <small>{date(n.sent_at)}</small>
              </span>
              <span className="v-row-value">{n.read_at ? "" : "New"}</span>
              <Chevron />
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

const safeUrl = (u: string) => /^(https?:\/\/|\/)/i.test(u);

export function NoticeDetail() {
  const { notify } = useParent();
  const goTo = useGoTo();
  const id = useQueryId("id");
  const list = useApi<InboxNotice[]>(NOTICES, { limit: 200 });
  const [busy, setBusy] = useState(false);
  const [readNow, setReadNow] = useState<string | null>(null);

  if (list.loading && !list.data) return <PmLoading />;
  if (list.error) return <PmError>{list.error}</PmError>;
  const n = list.data?.find((x) => x.recipient_id === id);
  if (!n)
    return (
      <>
        <PmEmpty title="Notice not found">It may be older than the latest 200 notices.</PmEmpty>
        <button className="action secondary" onClick={() => goTo(33)}>
          Notice board
        </button>
      </>
    );

  const readAt = n.read_at ?? readNow;
  async function acknowledge() {
    setBusy(true);
    try {
      await api.post(`${NOTICES}/${n!.recipient_id}/mark-read`);
      setReadNow(new Date().toISOString());
      notify("Marked as read.");
      list.reload();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span className="eyebrow">SCHOOL CIRCULAR</span>
      <h1>{n.title}</h1>
      <p className="lead">{date(n.sent_at)}</p>
      <p style={{ whiteSpace: "pre-wrap" }}>{n.body}</p>
      {/* Not wired: event date, time and venue rows — notices are free text with no structured fields. */}
      {n.attachment_url && safeUrl(n.attachment_url) ? (
        <p>
          <a className="quiet-link" href={n.attachment_url} target="_blank" rel="noopener noreferrer">
            Open attachment
          </a>
        </p>
      ) : null}
      {readAt ? (
        <p className="micro">{`Read ${dateTime(readAt)}`}</p>
      ) : (
        <button className="action secondary" disabled={busy} onClick={acknowledge}>
          {busy ? "Saving…" : "Acknowledge circular"}
        </button>
      )}
    </>
  );
}
