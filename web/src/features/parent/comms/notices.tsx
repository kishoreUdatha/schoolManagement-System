"use client";

/*
 * PM-033 · Notice board and PM-034 · Notice detail, from the parent's notice
 * inbox (GET /parent/me/notices). Notices are addressed to the parent, not to
 * one child, so these lists do not change with the child bar.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date, dateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { categoryLabel, clock, longDate, NOTICE_CATEGORIES, noticeTarget } from "../home/parts";
import type { Notice } from "../home/types";
import { PmEmpty, PmError, PmLoading, useGoTo, useQueryId } from "./ui";

export type InboxNotice = Notice;

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
  const [category, setCategory] = useState("");
  const list = useApi<InboxNotice[]>(NOTICES, { unread_only: unread || undefined, category: category || undefined, limit: 100 });

  return (
    <>
      <div className="notice-feature">
        <span className="status blue">School office</span>
        <h2>Stay in the loop.</h2>
        <p>Announcements for your child’s school day.</p>
      </div>
      <label className="field">
        Category
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All notices</option>
          {NOTICE_CATEGORIES.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Show
        <select value={unread ? "unread" : "all"} onChange={(e) => setUnread(e.target.value === "unread")}>
          <option value="all">Read and unread</option>
          <option value="unread">Unread only</option>
        </select>
      </label>
      <PmError>{list.error}</PmError>
      {list.loading && !list.data ? <PmLoading /> : null}
      {list.data && !list.data.length ? (
        <PmEmpty title={unread ? "All caught up" : "No notices yet"}>{unread ? "You have read every notice." : category ? `Nothing under ${categoryLabel(category)}.` : "School announcements will appear here."}</PmEmpty>
      ) : null}
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
                <small>{`${date(n.sent_at)} · ${categoryLabel(n.category)}`}</small>
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
  const { notify, children, childId, setChild } = useParent();
  const router = useRouter();
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

  const target = noticeTarget(n.link);
  const time = n.event_start_time ? (n.event_end_time ? `${clock(n.event_start_time)}–${clock(n.event_end_time)}` : clock(n.event_start_time)) : null;
  function openTarget() {
    if (!target) return;
    if (n!.student_id && n!.student_id !== childId && children.some((c) => c.id === n!.student_id)) setChild(n!.student_id);
    router.push(target);
  }

  return (
    <>
      <span className="eyebrow">{n.category === "general" ? "SCHOOL CIRCULAR" : categoryLabel(n.category).toUpperCase()}</span>
      <h1>{n.title}</h1>
      <p className="lead">{`${date(n.sent_at)} · ${categoryLabel(n.category)}`}</p>
      <p style={{ whiteSpace: "pre-wrap" }}>{n.body}</p>
      {n.event_date || time || n.event_venue ? (
        <dl>
          {n.event_date ? (
            <div>
              <dt>Date</dt>
              <dd>{longDate(n.event_date)}</dd>
            </div>
          ) : null}
          {time ? (
            <div>
              <dt>Time</dt>
              <dd>{time}</dd>
            </div>
          ) : null}
          {n.event_venue ? (
            <div>
              <dt>Venue</dt>
              <dd>{n.event_venue}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {target ? (
        <button className="action" onClick={openTarget}>
          {n.category === "fees" ? "View fees" : n.category === "homework" ? "Open homework" : n.category === "attendance" ? "View attendance" : "Open"}
        </button>
      ) : null}
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
