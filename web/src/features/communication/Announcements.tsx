"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Badge } from "@/components/ui/primitives";
import { EmptyGuide, ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { usePermissions } from "@/lib/jobs";
import { useApi } from "@/lib/useApi";
import { CHANNEL_LABEL, type Delivery, NOTICE_AUDIENCE, type Notice, type NoticeAudience, deliveryLine, noticeAudience, useRole } from "./shared";

import { ask } from "@/lib/dialog";
type CampaignRow = {
  notice_id: number;
  title: string;
  audience: NoticeAudience;
  channels: string[];
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  created_by: string | null;
  recipients: number;
  read: number;
  delivery: Delivery[];
  overdue: boolean;
};

/** One announcement, as the list shows it, whichever endpoint it came from. */
type Item = {
  id: number;
  title: string;
  body: string | null;
  audience: string;
  audienceKey: string;
  status: string;
  when: string;
  sentAt: string | null;
  delivery: Delivery[];
  recipients: number;
  channels: string[];
};

/**
 * SCR-252, live. The office: GET /api/v1/school/notices, with
 * POST /notices/{id}/send and DELETE /notices/{id}. A teacher: the notices
 * they sent (GET /api/v1/teacher/notices). A principal: the campaign list
 * (GET /api/v1/school/event-ops/campaigns), which carries no message body.
 * Delivery is reported as the API counts it — sent, skipped and failed apart.
 */
export function Announcements() {
  const role = useRole();
  const perms = usePermissions();
  // the office, or office staff given the Communication job
  const office = role === "school_admin" || (role === "staff" && Boolean(perms?.has("notices.send")));
  const path = office ? "/api/v1/school/notices" : role === "teacher" ? "/api/v1/teacher/notices" : null;
  const notices = useApi<Notice[]>(path);
  const campaigns = useApi<{ rows: CampaignRow[] }>(role === "principal" ? "/api/v1/school/event-ops/campaigns" : null);
  const [typed, setTyped] = useState("");
  const [aud, setAud] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (role === null || (role === "staff" && perms === null)) return <Loading />;
  if (!office && !["teacher", "principal"].includes(role)) return <ErrorNote>Announcements are written by the school office and teachers.</ErrorNote>;

  const items: Item[] = notices.data
    ? notices.data.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        audience: noticeAudience(n),
        audienceKey: n.audience,
        status: n.status,
        when: n.sent_at ? `Sent ${dateTime(n.sent_at)}` : n.scheduled_at ? `Scheduled for ${dateTime(n.scheduled_at)}` : `Written ${dateTime(n.created_at)}`,
        sentAt: n.sent_at,
        delivery: n.delivery,
        recipients: n.recipient_count,
        channels: n.channels,
      }))
    : (campaigns.data?.rows ?? []).map((c) => ({
        id: c.notice_id,
        title: c.title,
        body: null,
        audience: NOTICE_AUDIENCE[c.audience] ?? label(c.audience),
        audienceKey: c.audience,
        status: c.status,
        when: c.sent_at ? `Sent ${dateTime(c.sent_at)}` : c.scheduled_at ? `Scheduled for ${dateTime(c.scheduled_at)}${c.overdue ? " (time has passed)" : ""}` : `Written ${dateTime(c.created_at)}`,
        sentAt: c.sent_at,
        delivery: c.delivery,
        recipients: c.recipients,
        channels: c.channels,
      }));

  const q = typed.trim().toLowerCase();
  const shown = items.filter((n) => (!q || n.title.toLowerCase().includes(q) || (n.body ?? "").toLowerCase().includes(q)) && (!aud || n.audienceKey === aud) && (!status || n.status === status));
  const loading = notices.loading || campaigns.loading;

  // Headline figures over everything loaded, not just what the filters show.
  const ready = Boolean(notices.data || campaigns.data);
  const num = (v: number) => (ready ? String(v) : "…");
  const month = new Date().toISOString().slice(0, 7);
  const sentMonth = items.filter((i) => i.sentAt && i.sentAt.slice(0, 7) === month);
  const failedTo = items.reduce((s, i) => s + i.delivery.reduce((t, d) => t + d.failed, 0), 0);
  const stats = [
    { label: "Sent this month", value: num(sentMonth.length), note: `${sentMonth.reduce((s, i) => s + i.recipients, 0)} recipient(s)` },
    { label: "Scheduled", value: num(items.filter((i) => i.status === "scheduled").length), note: "Waiting to go out" },
    { label: "Drafts", value: num(items.filter((i) => i.status === "draft").length), note: "Written, not sent" },
    { label: "Failed", value: num(failedTo), note: "Messages that did not reach someone" },
  ];

  async function send(n: Item) {
    if (!(await ask(`Send "${n.title}" to ${n.audience}?`))) return;
    try {
      const r = await api.post<Notice>(`/api/v1/school/notices/${n.id}/send`);
      notify(`Handed to ${r.recipient_count} recipient(s). ${deliveryLine(r.delivery)}.`);
      notices.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function remove(n: Item) {
    if (!(await ask(n.status === "sent" ? `Delete "${n.title}"? It also disappears from the inboxes of everyone it was sent to.` : `Delete "${n.title}"?`))) return;
    try {
      await api.delete(`/api/v1/school/notices/${n.id}`);
      notify("Deleted.");
      notices.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search announcements…" aria-label="Search announcements" />
        </div>
        <select aria-label="Filter by audience" value={aud} onChange={(e) => setAud(e.target.value)}>
          <option value="">All audiences</option>
          {(Object.keys(NOTICE_AUDIENCE) as NoticeAudience[]).map((a) => (
            <option key={a} value={a}>
              {NOTICE_AUDIENCE[a]}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      <ErrorNote>{error ?? notices.error ?? campaigns.error}</ErrorNote>
      {role === "principal" ? (
        <div className="tip" style={{ marginBottom: 16 }}>
          <Icon name="bell" className="sm" />
          <span>You can see what was announced and how far it got. Writing and sending announcements is done by the school office.</span>
        </div>
      ) : null}
      <div className="panel">
        {shown.map((n) => (
          <article className="notification-item" key={n.id}>
            <span className="avatar">
              <Icon name="message" />
            </span>
            <div className="notification-content">
              <h3>{n.title}</h3>
              {n.body ? <p>{n.body.length > 220 ? `${n.body.slice(0, 220)}…` : n.body}</p> : null}
              <time>{`${n.when} · ${n.audience} · ${n.channels.map((c) => CHANNEL_LABEL[c] ?? c).join(", ") || "no channel"}`}</time>
              {n.status === "sent" || n.delivery.length ? (
                <time style={{ display: "block" }}>{`${n.recipients} recipient(s) · ${deliveryLine(n.delivery)}`}</time>
              ) : null}
              {office && n.status !== "sent" ? (
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn primary" onClick={() => send(n)}>
                    Send now
                  </button>
                  <Link href={`${routeOf(254)}?id=${n.id}`} className="btn">
                    Edit
                  </Link>
                  <button type="button" className="btn" onClick={() => remove(n)}>
                    Delete
                  </button>
                </div>
              ) : office ? (
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn" onClick={() => remove(n)}>
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
            <Badge>{label(n.status)}</Badge>
          </article>
        ))}
        {!shown.length ? (
          loading || items.length ? (
            <div className="panel-pad muted">{loading ? "Loading announcements…" : "No announcements match these filters."}</div>
          ) : (
            <div className="panel-pad">
              <EmptyGuide
                title="No announcements yet"
                note="An announcement tells every parent and teacher the same thing at once — a holiday, a result day, a change of plan."
                action={
                  office ? (
                    <Link href="/communication/notification-campaigns" className="btn primary">
                      <Icon name="plus" className="sm" />
                      Create announcement
                    </Link>
                  ) : undefined
                }
              />
            </div>
          )
        ) : null}
      </div>
    </>
  );
}
