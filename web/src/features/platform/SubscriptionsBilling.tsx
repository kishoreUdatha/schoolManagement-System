"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { date, label, money } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { downloadCsv } from "./csv";
import type { Billing, BillingRow } from "./types";

const n = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString("en-IN"));

function standing(b: BillingRow): string {
  if (!b.plan_name) return "No plan";
  if (b.expired) return "Expired";
  if (b.expiring_soon) return "Due soon";
  return label(b.subscription_status ?? "active");
}

/**
 * SCR-014, live: GET /super-admin/billing — every organization's plan,
 * price, renewal and payments in one list. Invoicing is not modelled by the
 * backend, so there is no invoice number and no "Create invoice".
 */
export function SubscriptionsBilling() {
  const router = useRouter();
  const billing = useApi<Billing>("/api/v1/super-admin/billing");
  const [typed, setTyped] = useState("");
  const [status, setStatus] = useState("");

  const b = billing.data;
  const shown = useMemo(() => {
    const q = typed.trim().toLowerCase();
    return (b?.tenants ?? []).filter(
      (t) => (!q || t.tenant_name.toLowerCase().includes(q) || t.tenant_code.toLowerCase().includes(q)) && (!status || standing(t) === status),
    );
  }, [b, typed, status]);

  const stats = [
    { label: "On a plan", value: n(b?.on_a_plan), note: b ? `${b.without_a_plan} without a plan` : "Organizations" },
    { label: "Revenue (30 days)", value: b ? money(b.revenue_30d) : "…", note: "Payments recorded" },
    { label: "Due soon", value: n(b?.expiring_soon), note: b ? `${b.expired} expired` : "Renewals" },
    { label: "Failed payments", value: n(b?.failed_payments_30d), note: "Last 30 days" },
  ];

  const cells = (t: BillingRow) => [
    t.tenant_name,
    t.plan_name ?? "—",
    t.price === null ? "—" : `${money(t.price)}${t.billing_cycle ? ` / ${t.billing_cycle === "yearly" ? "year" : "month"}` : ""}`,
    money(t.total_paid),
    date(t.expires_at),
    standing(t),
  ];
  const rows: Row[] = shown.map((t) => {
    const c = cells(t);
    return [{ name: t.tenant_name, sub: t.tenant_code }, ...c.slice(1)];
  });

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by organization or code…" aria-label="Search organizations" />
        </div>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Due soon">Due soon</option>
          <option value="Expired">Expired</option>
          <option value="Pending">Pending</option>
          <option value="Cancelled">Cancelled</option>
          <option value="No plan">No plan</option>
        </select>
      </div>
      <ErrorNote>{billing.error}</ErrorNote>
      <Panel
        title="All subscriptions"
        sub={b && !b.invoicing_modelled ? "Invoices are not issued by the platform; payments are recorded against the subscription" : "Every organization"}
        action={
          <button
            type="button"
            className="btn"
            disabled={!shown.length}
            onClick={() =>
              downloadCsv(
                "subscriptions.csv",
                ["Organization", "Plan", "Billed amount", "Total paid", "Renewal", "Status", "Code", "Last payment", "Last payment status"],
                shown.map((t) => [...cells(t), t.tenant_code, date(t.last_payment_at), t.last_payment_status ?? ""]),
              )
            }
          >
            <Icon name="download" className="sm" />
            Export
          </button>
        }
        flush
      >
        <DataTable
          columns={["Organization", "Plan", "Billed amount", "Total paid", "Renewal", "Status"]}
          rows={rows}
          selectable={false}
          onView={(i) => router.push(`${routeOf(12)}?id=${shown[i].tenant_id}`)}
          empty={billing.loading ? "Loading subscriptions…" : "No organizations match these filters."}
        />
      </Panel>
    </>
  );
}
