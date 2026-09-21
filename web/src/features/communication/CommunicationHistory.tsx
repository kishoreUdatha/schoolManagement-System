"use client";

import { useCallback, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { date, dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { CHANNELS, CHANNEL_LABEL, downloadCsv, isoDay, useRole, useWindowEvent } from "./shared";

type Row = {
  recipient_id: number;
  notice_id: number;
  title: string;
  sent_on: string;
  to_user_id: number;
  to_name: string | null;
  to_role: string | null;
  channel: string;
  status: string;
  error: string | null;
  read_at: string | null;
};
type History = { from_date: string; to_date: string; rows: Row[]; count: number; by_status: { status: string; count: number }[]; truncated: boolean };

export const EXPORT_HISTORY_EVENT = "comm:export-history";
const CHANNEL_ICON: Record<string, IconName> = { in_app: "bell", email: "message", sms: "message", whatsapp: "message" };

/** Page-head "Export history"; the live panel below writes the CSV. */
export function ExportHistoryButton() {
  return (
    <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new CustomEvent(EXPORT_HISTORY_EVENT))}>
      <Icon name="download" className="sm" />
      Export history
    </button>
  );
}

/**
 * SCR-255, live: GET /api/v1/school/event-ops/history (from, to, channel).
 * Every message that reached a person, in the state the server recorded:
 * sent, delivered, queued, skipped (nothing on file for that channel) or
 * failed — skipped is never folded into failed.
 */
export function CommunicationHistory() {
  const role = useRole();
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 90 * 864e5)));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [channel, setChannel] = useState("");
  const [who, setWho] = useState("");
  const allowed = role === "school_admin" || role === "principal";
  const res = useApi<History>(allowed ? "/api/v1/school/event-ops/history" : null, { from, to, channel });

  const rows = useMemo(() => {
    const q = who.trim().toLowerCase();
    return (res.data?.rows ?? []).filter((r) => !q || (r.to_name ?? "").toLowerCase().includes(q) || r.title.toLowerCase().includes(q));
  }, [res.data, who]);

  const exportCsv = useCallback(() => {
    if (!rows.length) return notify("Nothing to export in this window.");
    downloadCsv(
      `communication-history-${from}-to-${to}.csv`,
      ["Sent", "Notice", "To", "Role", "Channel", "State", "Error", "Read"],
      rows.map((r) => [r.sent_on, r.title, r.to_name, r.to_role, CHANNEL_LABEL[r.channel] ?? r.channel, r.status, r.error, r.read_at]),
    );
  }, [rows, from, to]);
  useWindowEvent(EXPORT_HISTORY_EVENT, exportCsv);

  if (role === null) return <Loading />;
  if (!allowed) return <ErrorNote>Communication history is kept for the school office and the principal.</ErrorNote>;

  const count = (s: string) => res.data?.by_status.find((x) => x.status === s)?.count ?? 0;

  return (
    <div className="two-col">
      <div className="stack">
        <ErrorNote>{res.error}</ErrorNote>
        {res.data?.truncated ? (
          <div className="tip warn" role="alert">
            <Icon name="bell" className="sm" />
            <span>{`This is the first ${res.data.count} messages in the window. Narrow the dates or pick a channel to see everything.`}</span>
          </div>
        ) : null}
        <Panel title="Activity history" sub={res.data ? `${date(res.data.from_date)} to ${date(res.data.to_date)} · ${rows.length} message(s)` : "Loading…"}>
          {rows.map((r) => (
            <div className="timeline-item" key={r.recipient_id}>
              <span className="timeline-dot">
                <Icon name={CHANNEL_ICON[r.channel] ?? "message"} />
              </span>
              <div>
                <h4>{r.title}</h4>
                <p>
                  {`${CHANNEL_LABEL[r.channel] ?? r.channel} · ${r.to_name ?? "—"}${r.to_role ? ` (${label(r.to_role)})` : ""}${r.read_at ? ` · read ${dateTime(r.read_at)}` : ""}${r.error ? ` · ${r.error}` : ""}`}
                </p>
                <Badge>{label(r.status)}</Badge>
              </div>
              <time>{dateTime(r.sent_on)}</time>
            </div>
          ))}
          {!rows.length ? <p className="muted small">{res.loading ? "Loading…" : "Nothing was sent in this window."}</p> : null}
        </Panel>
      </div>
      <aside className="stack">
        <Panel title="Record information">
          <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
            <label className="field">
              <span>Person or notice</span>
              <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Filter by name…" />
            </label>
            <label className="field">
              <span>From</span>
              <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </label>
            <label className="field">
              <span>To</span>
              <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </label>
            <label className="field">
              <span>Channel</span>
              <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="">Every channel</option>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="gap" />
          <dl className="kv">
            <div>
              <dt>Messages</dt>
              <dd>{res.data?.count ?? "…"}</dd>
            </div>
            {(res.data?.by_status ?? []).map((s) => (
              <div key={s.status}>
                <dt>{label(s.status)}</dt>
                <dd>{s.count}</dd>
              </div>
            ))}
            <div>
              <dt>Read</dt>
              <dd>{res.data ? res.data.rows.filter((r) => r.read_at).length : "…"}</dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Next action">
          <p className="muted small">
            {count("failed")
              ? `${count("failed")} message(s) failed to send — worth checking the channel’s set-up.`
              : count("skipped")
                ? `${count("skipped")} message(s) were skipped: nothing on file for that channel. Fill in the missing contact details.`
                : "Nothing failed or was skipped in this window."}
          </p>
          <div className="gap" />
          <button type="button" className="btn" onClick={exportCsv}>
            <Icon name="download" className="sm" />
            Export CSV
          </button>
        </Panel>
      </aside>
    </div>
  );
}
