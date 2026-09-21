"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import type { Paginated } from "@/lib/api";
import { date, label } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { downloadCsv } from "./csv";
import type { Billing, Tenant, UsageOverview } from "./types";

const PAGE_SIZE = 25;
const n = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString("en-IN"));

/**
 * SCR-010, live: GET /super-admin/tenants (search, status, paging), joined
 * with /super-admin/billing for plan and renewal and /super-admin/usage-overview
 * for active users. Both joins cover every tenant in one call each.
 */
export function OrganizationsList() {
  const router = useRouter();
  const initialStatus = useSearchParams().get("status") ?? "";
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);
  useEffect(() => setPage(1), [search, status]);

  const list = useApi<Paginated<Tenant>>("/api/v1/super-admin/tenants", { search, status, page, page_size: PAGE_SIZE });
  const active = useApi<Paginated<Tenant>>("/api/v1/super-admin/tenants", { status: "active", page_size: 1 });
  const all = useApi<Paginated<Tenant>>("/api/v1/super-admin/tenants", { page_size: 1 });
  const billing = useApi<Billing>("/api/v1/super-admin/billing");
  const usage = useApi<UsageOverview>("/api/v1/super-admin/usage-overview");

  const billOf = useMemo(() => new Map(billing.data?.tenants.map((b) => [b.tenant_id, b]) ?? []), [billing.data]);
  const usersOf = useMemo(() => new Map(usage.data?.tenants.map((u) => [u.tenant_id, u.active_users]) ?? []), [usage.data]);

  const stats = [
    { label: "Organizations", value: n(all.data?.total), note: "On the platform" },
    { label: "Active organizations", value: n(active.data?.total), note: "Can sign in and use the product" },
    { label: "On a plan", value: n(billing.data?.on_a_plan), note: billing.data ? `${billing.data.without_a_plan} without a plan` : "With a subscription" },
    { label: "Expiring soon", value: n(billing.data?.expiring_soon), note: billing.data ? `${billing.data.expired} already expired` : "Subscriptions" },
  ];

  const items = list.data?.items ?? [];
  const table = items.map((t) => {
    const b = billOf.get(t.id);
    const users = usersOf.get(t.id);
    return {
      t,
      cells: [t.name, t.code, b?.plan_name ?? "No plan", users === undefined ? "—" : users.toLocaleString("en-IN"), date(b?.expires_at), label(t.status)],
    };
  });
  const rows: Row[] = table.map(({ t, cells }) => [{ name: t.name, sub: t.code }, ...cells.slice(2)]);

  function exportCsv() {
    downloadCsv(
      "organizations.csv",
      ["Organization", "Code", "Plan", "Active users", "Renewal", "Status", "Contact email", "Contact mobile"],
      table.map(({ t, cells }) => [...cells, t.contact_email, t.contact_mobile]),
    );
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by name or code…" aria-label="Search organizations" />
        </div>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>
      <ErrorNote>{list.error ?? billing.error}</ErrorNote>
      <Panel
        title="All organizations"
        sub={`Newest first${list.loading ? " · Loading…" : ""}`}
        action={
          <button type="button" className="btn" onClick={exportCsv} disabled={!items.length}>
            <Icon name="download" className="sm" />
            Export
          </button>
        }
        flush
      >
        <DataTable
          columns={["Organization", "Plan", "Users", "Renewal", "Status"]}
          rows={rows}
          selectable={false}
          total={list.data?.total}
          page={page}
          pages={list.data?.pages ?? 1}
          onPage={setPage}
          onView={(i) => router.push(`${routeOf(12)}?id=${items[i].id}`)}
          empty={list.loading ? "Loading organizations…" : search || status ? "No organizations match these filters." : "No organizations yet."}
        />
      </Panel>
    </>
  );
}
