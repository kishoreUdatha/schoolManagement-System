"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { CHANNEL_LABEL, type Delivery, NOTICE_AUDIENCE, type Notice, type NoticeAudience, deliveryLine, noticeAudience, useRole } from "./shared";

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
  const office = role === "school_admin";
  const path = office ? "/api/v1/school/notices" : role === "teacher" ? "/api/v1/teacher/notices" : null;
  const notices = useApi<Notice[]>(path);
  const campaigns = useApi<{ rows: CampaignRow[] }>(role === "principal" ? "/api/v1/school/event-ops/campaigns" : null);
  const [typed, setTyped] = useState("");
  const [aud, setAud] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (role === null) return <Loading />;
  if (!["school_admin", "teacher", "principal"].includes(role)) return <ErrorNote>Announcements are written by the school office and teachers.</ErrorNote>;

  const items: Item[] = notices.data
    ? notices.data.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        audience: noticeAudience(n),
        audienceKey: n.audience,
        status: n.status,
        when: n.sent_at ? `Sent ${dateTime(n.sent_at)}` : n.scheduled_at ? `Scheduled for ${dateTime(n.scheduled_at)}` : `Written ${dateTime(n.created_at)}`,
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
        delivery: c.delivery,
        recipients: c.recipients,
        channels: c.channels,
      }));

  const q = typed.trim().toLowerCase();
  const shown = items.filter((n) => (!q || n.title.toLowerCase().includes(q) || (n.body ?? "").toLowerCase().includes(q)) && (!aud || n.audienceKey === aud) && (!status || n.status === status));
  const loading = notices.loading || campaigns.loading;

  async function send(n: Item) {
    if (!window.confirm(`Send "${n.title}" to ${n.audience}?`)) return;
    try {
      const r = await api.post<Notice>(`/api/v1/school/notices/${n.id}/send`);
      notify(`Handed to ${r.recipient_count} recipient(s). ${deliveryLine(r.delivery)}.`);
      notices.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function remove(n: Item) {
    if (!window.confirm(n.status === "sent" ? `Delete "${n.title}"? It also disappears from the inboxes of everyone it was sent to.` : `Delete "${n.title}"?`)) return;
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
          <div className="panel-pad muted">{loading ? "Loading announcements…" : items.length ? "No announcements match these filters." : "No announcements yet."}</div>
        ) : null}
      </div>
    </>
  );
}
