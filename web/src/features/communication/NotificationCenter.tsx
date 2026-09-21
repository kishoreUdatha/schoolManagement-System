"use client";

import { useCallback, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { type InboxItem, STAFF_ROLES, useRole, useWindowEvent } from "./shared";

export const MARK_ALL_EVENT = "comm:mark-all-read";
const LIMIT = 100;
const TONES = ["", "mint", "peach", "lilac"];

/** Page-head "Mark all as read"; the live list below does the work. */
export function MarkAllReadButton() {
  return (
    <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new CustomEvent(MARK_ALL_EVENT))}>
      <Icon name="check" className="sm" />
      Mark all as read
    </button>
  );
}

/**
 * SCR-296, live: the signed-in person's own notices. Staff (office,
 * principal, teachers, accountants) read GET /api/v1/staff/inbox with
 * /inbox/unread-count and POST /inbox/{id}/mark-read; a parent reads
 * GET /api/v1/parent/me/notices with the same pair under /parent/me/notices.
 */
export function NotificationCenter() {
  const role = useRole();
  const base = role === "parent" ? "/api/v1/parent/me/notices" : role && STAFF_ROLES.includes(role) ? "/api/v1/staff/inbox" : null;
  const [tab, setTab] = useState<"all" | "unread" | "read">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useApi<InboxItem[]>(base, { limit: LIMIT });
  const unread = useApi<{ unread: number }>(base ? `${base}/unread-count` : null);

  const items = list.data ?? [];
  const reload = useCallback(() => {
    list.reload();
    unread.reload();
  }, [list, unread]);

  const markAll = useCallback(async () => {
    if (!base) return;
    const pending = items.filter((i) => !i.read_at);
    if (!pending.length) return notify("Everything shown is already read.");
    setBusy(true);
    let failed = 0;
    for (const i of pending) {
      try {
        await api.post(`${base}/${i.recipient_id}/mark-read`);
      } catch {
        failed += 1; // one failure must not strand the rest; the reload tells the truth
      }
    }
    setBusy(false);
    notify(failed ? `${pending.length - failed} marked as read; ${failed} could not be.` : `${pending.length} marked as read.`);
    reload();
  }, [base, items, reload]);
  useWindowEvent(MARK_ALL_EVENT, markAll);

  if (role === null) return <Loading />;
  if (!base) return <ErrorNote>There is no notification inbox for this account type yet.</ErrorNote>;

  async function markRead(i: InboxItem) {
    if (i.read_at) return;
    try {
      await api.post(`${base}/${i.recipient_id}/mark-read`);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const shown = items.filter((i) => (tab === "all" ? true : tab === "unread" ? !i.read_at : Boolean(i.read_at)));
  const readCount = items.filter((i) => i.read_at).length;

  return (
    <>
      <nav className="module-tabs">
        <button type="button" className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>
          {"All notifications "}
          <span className="muted">{items.length}</span>
        </button>
        <button type="button" className={tab === "unread" ? "active" : ""} onClick={() => setTab("unread")}>
          {"Unread "}
          <span>{unread.data?.unread ?? "…"}</span>
        </button>
        <button type="button" className={tab === "read" ? "active" : ""} onClick={() => setTab("read")}>
          {"Read "}
          <span className="muted">{readCount}</span>
        </button>
      </nav>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      {unread.data && unread.data.unread > items.filter((i) => !i.read_at).length ? (
        <p className="muted small" style={{ marginBottom: 12 }}>{`Showing the latest ${items.length}. ${unread.data.unread} unread in all.`}</p>
      ) : null}
      <div className="panel" aria-busy={busy}>
        {shown.map((i, n) => (
          <article className={`notification-item ${i.read_at ? "" : "unread"}`} key={i.recipient_id}>
            <span className={`avatar ${TONES[n % 4]}`}>
              <Icon name="bell" />
            </span>
            <div className="notification-content">
              <h3>{i.title}</h3>
              <p style={{ whiteSpace: "pre-line" }}>{i.body.length > 260 ? `${i.body.slice(0, 260)}…` : i.body}</p>
              <time>{`${i.sent_at ? dateTime(i.sent_at) : "Not sent yet"}${i.read_at ? ` · Read ${dateTime(i.read_at)}` : ""}`}</time>
            </div>
            {i.attachment_url ? (
              <a href={i.attachment_url} target="_blank" rel="noreferrer" className="btn text">
                Attachment
              </a>
            ) : null}
            {!i.read_at ? (
              <>
                <button type="button" className="btn text" onClick={() => markRead(i)}>
                  Mark read
                </button>
                <span className="read-dot" />
              </>
            ) : null}
          </article>
        ))}
        {!shown.length ? (
          <div className="panel-pad muted">{list.loading ? "Loading…" : tab === "unread" ? "Nothing unread." : tab === "read" ? "Nothing read yet." : "Nothing has been sent to you yet."}</div>
        ) : null}
      </div>
    </>
  );
}
