"use client";

import { Fragment, useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { PmEmpty, PmError, PmLoading } from "./parts";
import type { Notice } from "./types";

const BASE = "/api/v1/parent/me/notices";

/**
 * PM-007. The school's notices to this parent, newest first. Opening one
 * shows its text and marks it read.
 * Not wired: category filter (Attendance / Homework / Fees) and deep links to records — notices carry no category or target.
 */
export function Notifications() {
  const { notify } = useParent();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const list = useApi<Notice[]>(BASE, { unread_only: unreadOnly, limit: 100 });
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [readNow, setReadNow] = useState<Set<number>>(new Set());

  const isUnread = (n: Notice) => !n.read_at && !readNow.has(n.recipient_id);
  const items = list.data ?? [];
  const unread = items.filter(isUnread);

  async function openNotice(n: Notice) {
    setOpen((cur) => (cur === n.recipient_id ? null : n.recipient_id));
    if (!isUnread(n)) return;
    try {
      await api.post(`${BASE}/${n.recipient_id}/mark-read`);
      setReadNow((s) => new Set(s).add(n.recipient_id));
    } catch (e) {
      notify(errorText(e));
    }
  }

  async function markAll() {
    setBusy(true);
    try {
      for (const n of unread) await api.post(`${BASE}/${n.recipient_id}/mark-read`);
      notify("All notifications marked as read.");
      setReadNow(new Set());
      list.reload();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className="field">
        Show
        <select value={unreadOnly ? "unread" : "all"} onChange={(e) => setUnreadOnly(e.target.value === "unread")}>
          <option value="all">All notifications</option>
          <option value="unread">Unread only</option>
        </select>
      </label>
      <PmError>{list.error}</PmError>
      {list.loading && !list.data ? <PmLoading /> : null}
      {list.data && items.length === 0 ? <PmEmpty title={unreadOnly ? "No unread notifications" : "No notifications yet"}>Notices from the school appear here.</PmEmpty> : null}
      {items.map((n) => (
        <Fragment key={n.recipient_id}>
          <button className="item" onClick={() => openNotice(n)} aria-expanded={open === n.recipient_id}>
            <span>
              <strong>{n.title}</strong>
              <small>{dateTime(n.sent_at)}</small>
              {open === n.recipient_id ? <small style={{ whiteSpace: "pre-line", display: "block", marginTop: 6 }}>{n.body}</small> : null}
            </span>
            <span className={isUnread(n) ? "value blue-text" : "value"}>{isUnread(n) ? "New" : "›"}</span>
          </button>
          {open === n.recipient_id && n.attachment_url ? (
            <button className="action secondary" onClick={() => window.open(n.attachment_url!, "_blank", "noopener")}>
              Open attachment
            </button>
          ) : null}
        </Fragment>
      ))}
      {unread.length > 0 ? (
        <button className="action secondary" onClick={markAll} disabled={busy}>
          {busy ? "Marking…" : `Mark all as read (${unread.length})`}
        </button>
      ) : null}
    </>
  );
}
