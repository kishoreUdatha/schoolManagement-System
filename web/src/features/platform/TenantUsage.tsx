"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { api, errorText } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { date, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { Billing, Meter, UsageOverview, UsageRow } from "./types";

type Overview = UsageOverview & { total?: number; over_quota?: number; near_quota?: number; without_limits?: number };

const num = (v: number) => v.toLocaleString("en-IN");
const n = (v: number | undefined) => (v === undefined ? "…" : num(v));

function standing(t: UsageRow) {
  if (t.over.length) return `Over: ${t.over.map(label).join(", ")}`;
  if (t.near.length) return `Near: ${t.near.map(label).join(", ")}`;
  if (t.no_limits_set) return "No limits set";
  return "Within limits";
}

function Usage({ title, m, unit = "", remaining }: { title: string; m: Meter; unit?: string; remaining: string }) {
  const unlimited = m.unlimited || !m.limit;
  const p = unlimited ? 0 : Math.min(100, m.percent ?? (m.used / (m.limit || 1)) * 100);
  return (
    <div className="usage-row">
      <div className="spread">
        <strong>{title}</strong>
        <span>{unlimited ? `${num(m.used)}${unit} · no limit` : `${num(m.used)}${unit} / ${num(m.limit ?? 0)}${unit}`}</span>
      </div>
      <div className="bar-track">
        <i style={{ width: `${p}%` }} />
      </div>
      <p>{unlimited ? "The plan sets no limit" : `${num(Math.max(0, (m.limit ?? 0) - m.used))}${unit} ${remaining}`}</p>
    </div>
  );
}

/**
 * SCR-015, live: GET /super-admin/usage-overview (every organization against
 * its plan's limits) and /super-admin/billing for the subscription panel.
 * Limits belong to the plan, so "Edit limits" opens Subscription Plans.
 * "Export daily usage" downloads GET /super-admin/usage/export.csv (?from&to).
 */
export function TenantUsage() {
  const router = useRouter();
  const wanted = useSearchParams().get("id");
  const overview = useApi<Overview>("/api/v1/super-admin/usage-overview");
  const billing = useApi<Billing>("/api/v1/super-admin/billing");
  const [tenantId, setTenantId] = useState<number | null>(wanted ? Number(wanted) : null);
  const [filter, setFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportUsage() {
    setExporting(true);
    setExportError(null);
    try {
      await api.download("/api/v1/super-admin/usage/export.csv", `tenant-usage${from || to ? `-${from || "start"}-to-${to || "today"}` : ""}.csv`, { from, to });
      notify("Daily usage exported.");
    } catch (err) {
      setExportError(errorText(err));
    } finally {
      setExporting(false);
    }
  }

  const tenants = useMemo(() => overview.data?.tenants ?? [], [overview.data]);
  useEffect(() => {
    if (tenantId === null && tenants.length) setTenantId(tenants[0].tenant_id);
  }, [tenants, tenantId]);

  const t = tenants.find((x) => x.tenant_id === tenantId);
  const bill = billing.data?.tenants.find((x) => x.tenant_id === tenantId);
  const o = overview.data;

  const shown = tenants.filter((x) =>
    filter === "over" ? x.over.length > 0 : filter === "near" ? x.near.length > 0 && !x.over.length : filter === "none" ? x.no_limits_set : true,
  );
  const pctOf = (m: Meter) => (m.unlimited || !m.limit ? "No limit" : `${Math.round(m.percent ?? 0)}%`);
  const rows: Row[] = shown.map((x) => [{ name: x.tenant_name, sub: x.tenant_code }, `${num(x.students.used)} · ${pctOf(x.students)}`, `${num(x.staff.used)} · ${pctOf(x.staff)}`, num(x.active_users), standing(x)]);

  const stats = [
    { label: "Organizations", value: n(o?.total ?? tenants.length), note: "Measured against their plan" },
    { label: "Over a limit", value: n(o?.over_quota), note: "Reported, not enforced" },
    { label: "Near a limit", value: n(o?.near_quota), note: "At or above 80%" },
    { label: "No limits set", value: n(o?.without_limits), note: "Nothing to breach" },
  ];

  return (
    <>
      <div className="filterbar">
        <select aria-label="Organization" value={tenantId ?? ""} onChange={(e) => setTenantId(Number(e.target.value))}>
          {tenants.map((x) => (
            <option key={x.tenant_id} value={x.tenant_id}>
              {x.tenant_name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by usage" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All organizations</option>
          <option value="over">Over a limit</option>
          <option value="near">Near a limit</option>
          <option value="none">No limits set</option>
        </select>
      </div>
      <ErrorNote>{exportError ?? overview.error ?? billing.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <div className="two-col" style={{ marginBottom: 20 }}>
        <div>
          <Panel title="Plan usage" sub={t ? `${t.tenant_name} · ${bill?.plan_name ?? "No plan"}` : overview.loading ? "Loading…" : "Choose an organization"}>
            {t ? (
              <>
                <Usage title="Students" m={t.students} remaining="student places available" />
                <Usage title="Staff accounts" m={t.staff} remaining="accounts available" />
                <Usage title="File storage" m={t.storage_mb} unit=" MB" remaining="remaining" />
                <Usage title="SMS" m={t.sms} remaining="messages left in the quota" />
                <Usage title="WhatsApp" m={t.whatsapp} remaining="messages left in the quota" />
                <Usage title="Email" m={t.email} remaining="messages left in the quota" />
              </>
            ) : (
              <p className="muted">{overview.loading ? "Loading…" : "No organizations yet."}</p>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Subscription">
            <dl className="kv">
              <div>
                <dt>Organization</dt>
                <dd>{t?.tenant_name ?? "—"}</dd>
              </div>
              <div>
                <dt>Plan</dt>
                <dd>{bill?.plan_name ?? "No plan"}</dd>
              </div>
              <div>
                <dt>Billing</dt>
                <dd>{bill?.price !== null && bill?.price !== undefined ? `${money(bill.price)} · ${label(bill.billing_cycle)}` : "—"}</dd>
              </div>
              <div>
                <dt>Renewal date</dt>
                <dd>{date(bill?.expires_at)}</dd>
              </div>
              <div>
                <dt>Active users</dt>
                <dd>{t ? num(t.active_users) : "—"}</dd>
              </div>
              <div>
                <dt>Parents</dt>
                <dd>{t ? num(t.parents) : "—"}</dd>
              </div>
            </dl>
          </Panel>
        </aside>
      </div>
      <Panel
        title="All organizations"
        sub="Students and staff against the plan's limits"
        action={
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input type="date" aria-label="Usage from" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" aria-label="Usage to" value={to} onChange={(e) => setTo(e.target.value)} />
            <button type="button" className="btn" disabled={exporting} onClick={exportUsage}>
              <Icon name="download" className="sm" />
              {exporting ? "Exporting…" : "Export daily usage"}
            </button>
          </div>
        }
        flush
      >
        <DataTable
          columns={["Organization", "Students", "Staff", "Active users", "Status"]}
          rows={rows}
          selectable={false}
          onView={(i) => router.push(`${routeOf(12)}?id=${shown[i].tenant_id}`)}
          empty={overview.loading ? "Loading usage…" : "No organizations match this filter."}
        />
      </Panel>
    </>
  );
}
