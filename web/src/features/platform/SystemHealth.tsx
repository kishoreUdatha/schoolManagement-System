"use client";

import { DataTable, type Row } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { dateTime, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { Health } from "./types";

const STATE: Record<string, string> = {
  up: "Operational",
  down: "Down · failed",
  not_configured: "Not configured",
  configured: "Configured · not monitored",
};

/**
 * SCR-018, live: GET /super-admin/health. Only the application and the
 * database are probed; the rest are shown as the API labels them, never as
 * "operational". There is no history, so no availability, latency or trend.
 */
export function SystemHealth() {
  const health = useApi<Health>("/api/v1/super-admin/health");
  const h = health.data;
  const monitored = h?.checks.filter((c) => c.monitored) ?? [];
  const up = monitored.filter((c) => c.state === "up").length;

  const stats = [
    { label: "Monitored services up", value: h ? `${up} / ${monitored.length}` : "…", note: h ? `${h.unmonitored} not monitored` : "Probed on each check" },
    { label: "Open tickets", value: h ? String(h.open_tickets) : "…", note: "Support queue" },
    { label: "Active organizations", value: h ? String(h.tenants_active) : "…", note: "Can sign in" },
    { label: "Active users", value: h ? h.users_active.toLocaleString("en-IN") : "…", note: h ? `${h.usage_rows_today} usage records today` : "Across the platform" },
  ];

  const rows: Row[] = (h?.checks ?? []).map((c) => [c.name, c.monitored ? "Probed" : "Not monitored", c.detail, h ? dateTime(h.checked_at) : "—", STATE[c.state] ?? label(c.state)]);

  return (
    <>
      <ErrorNote>{health.error}</ErrorNote>
      <StatStrip items={stats} compact />
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
        {/* Not wired: availability %, latency and the response-time chart — no endpoint keeps history. */}
        <DataTable
          columns={["Service", "Monitoring", "Description", "Last checked", "Status"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          empty={health.loading ? "Checking services…" : "No checks reported."}
        />
      </Panel>
    </>
  );
}
