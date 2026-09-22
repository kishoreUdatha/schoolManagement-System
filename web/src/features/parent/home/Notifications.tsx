"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { categoryLabel, NOTICE_CATEGORIES, noticeTarget, PmEmpty, PmError, PmLoading } from "./parts";
import type { Notice } from "./types";

const BASE = "/api/v1/parent/me/notices";

/**
 * PM-007. The school's notices to this parent, newest first, filtered by
 * category. Opening one marks it read; a notice about a record (an absence,
 * a homework, a fee) opens that record — for the child it is about — and
 * the rest open in place.
 */
export function Notifications() {
  const { notify, children, childId, setChild } = useParent();
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const list = useApi<Notice[]>(BASE, { unread_only: unreadOnly, category: category || undefined, limit: 100 });
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [readNow, setReadNow] = useState<Set<number>>(new Set());

  const isUnread = (n: Notice) => !n.read_at && !readNow.has(n.recipient_id);
  const items = list.data ?? [];
  const unread = items.filter(isUnread);

  async function markRead(n: Notice) {
    if (!isUnread(n)) return;
    try {
      await api.post(`${BASE}/${n.recipient_id}/mark-read`);
      setReadNow((s) => new Set(s).add(n.recipient_id));
    } catch (e) {
      notify(errorText(e));
    }
  }

  async function openNotice(n: Notice) {
    const target = noticeTarget(n.link);
    if (target) {
      await markRead(n);
      // Show the record of the child the notice is about, not whoever is picked.
      if (n.student_id && n.student_id !== childId && children.some((c) => c.id === n.student_id)) setChild(n.student_id);
      router.push(target);
      return;
    }
    setOpen((cur) => (cur === n.recipient_id ? null : n.recipient_id));
    await markRead(n);
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

  const aboutChild = (n: Notice) => (n.student_id && children.length > 1 ? children.find((c) => c.id === n.student_id)?.full_name.split(/\s+/)[0] : null);

  return (
    <>
      <label className="field">
        Category
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All notifications</option>
          {NOTICE_CATEGORIES.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Show
        <select value={unreadOnly ? "unread" : "all"} onChange={(e) => setUnreadOnly(e.target.value === "unread")}>
          <option value="all">Read and unread</option>
          <option value="unread">Unread only</option>
        </select>
      </label>
      <PmError>{list.error}</PmError>
      {list.loading && !list.data ? <PmLoading /> : null}
      {list.data && items.length === 0 ? (
        <PmEmpty title={unreadOnly ? "No unread notifications" : "No notifications yet"}>{category ? `Nothing under ${categoryLabel(category)}.` : "Notices from the school appear here."}</PmEmpty>
      ) : null}
      {items.map((n) => (
        <Fragment key={n.recipient_id}>
          <button className="item" onClick={() => openNotice(n)} aria-expanded={noticeTarget(n.link) ? undefined : open === n.recipient_id}>
            <span>
              <strong>{n.title}</strong>
              <small>{[dateTime(n.sent_at), categoryLabel(n.category), aboutChild(n)].filter(Boolean).join(" · ")}</small>
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
