"use client";

import { useState } from "react";
import { Chart } from "@/components/ui/Chart";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { dateTime, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { Health, HealthHistory } from "./types";

const STATE: Record<string, string> = {
  up: "Operational",
  down: "Down · failed",
  not_configured: "Not configured",
  configured: "Configured · not monitored",
};

/**
 * SCR-018, live: GET /super-admin/health and GET /super-admin/health/history.
 * Only the application and the database are probed; the rest are shown as
 * the API labels them, never as "operational". Availability and response
 * time come from the kept probes (one every five minutes, and each check here).
 */
export function SystemHealth() {
  const [days, setDays] = useState(7);
  const health = useApi<Health>("/api/v1/super-admin/health");
  const history = useApi<HealthHistory>("/api/v1/super-admin/health/history", { days });
  const h = health.data;
  const hist = history.data;
  const monitored = h?.checks.filter((c) => c.monitored) ?? [];
  const up = monitored.filter((c) => c.state === "up").length;
  const svc = new Map((hist?.services ?? []).map((s) => [s.service, s]));
  const db = svc.get("Database");
  const blocks = hist?.response_time ?? [];
  const peak = Math.max(0, ...blocks.map((b) => b.avg_latency_ms ?? 0));
  const hour = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const stats = [
    { label: "Monitored services up", value: h ? `${up} / ${monitored.length}` : "…", note: h ? `${h.unmonitored} not monitored` : "Probed on each check" },
    {
      label: "Availability",
      value: db?.availability != null ? `${db.availability}%` : "—",
      note: hist ? (db ? `Database · last ${days} day(s) · ${db.samples} probes` : "No probes kept yet") : "From the kept probes",
    },
    {
      label: "Database response",
      value: db?.avg_latency_ms != null ? `${db.avg_latency_ms} ms` : "—",
      note: db?.p95_latency_ms != null ? `Average · 95% under ${db.p95_latency_ms} ms` : "Average over the period",
    },
    { label: "Active users", value: h ? h.users_active.toLocaleString("en-IN") : "…", note: h ? `${h.usage_rows_today} usage records today` : "Across the platform" },
  ];

  const rows: Row[] = (h?.checks ?? []).map((c) => {
    const s = svc.get(c.name);
    return [
      c.name,
      c.monitored ? "Probed" : "Not monitored",
      c.detail,
      s?.availability != null ? `${s.availability}%` : "—",
      s?.avg_latency_ms != null ? `${s.avg_latency_ms} ms` : "—",
      h ? dateTime(h.checked_at) : "—",
      STATE[c.state] ?? label(c.state),
    ];
  });

  return (
    <>
      <ErrorNote>{health.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <Panel
        title="Response time"
        sub={blocks.some((b) => b.samples) ? `Database · last 24 hours, four-hour averages · % of the slowest (${peak} ms)` : "Database · last 24 hours"}
        action={
          <select aria-label="Availability period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[1, 7, 30, 90].map((n) => (
              <option key={n} value={n}>{n === 1 ? "Availability: last 24 hours" : `Availability: last ${n} days`}</option>
            ))}
          </select>
        }
      >
        <ErrorNote>{history.error}</ErrorNote>
        {peak > 0 ? (
          <Chart kind="line" labels={blocks.map((b) => hour(b.from))} values={blocks.map((b) => (b.avg_latency_ms ? Math.round((b.avg_latency_ms / peak) * 100) : 0))} label="Database response time, last 24 hours" />
        ) : (
          <p className="muted">{history.loading ? "Loading…" : "No response times kept yet. A probe is taken every five minutes, so the chart fills in over the day."}</p>
        )}
      </Panel>
      <div style={{ height: 20 }} />
      <Panel
        title="Services"
        sub={h ? `Checked ${dateTime(h.checked_at)}` : "Checking…"}
        action={
          <div className="row" style={{ gap: 8 }}>
            {h ? <span className={`badge ${h.all_monitored_up ? "" : "bad"}`}>{h.all_monitored_up ? "All monitored services up" : "A monitored service is down"}</span> : null}
            <button type="button" className="btn" onClick={() => health.reload()} disabled={health.loading}>
              {health.loading ? "Checking…" : "Check again"}
            </button>
          </div>
        }
        flush
      >
        <DataTable
          columns={["Service", "Monitoring", "Description", `Availability (${days}d)`, "Avg response", "Last checked", "Status"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          empty={health.loading ? "Checking services…" : "No checks reported."}
        />
      </Panel>
    </>
  );
}
