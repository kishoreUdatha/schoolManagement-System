"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { ROLES, roleKind, signsInAs } from "./rbac";
import type { Permission, Role } from "./types";

/** SCR-285, live: GET /api/v1/school/roles (built-in and custom), counted against GET /permissions. */
export function RolesList() {
  const router = useRouter();
  const roles = useApi<Role[]>(ROLES);
  const perms = useApi<Permission[]>("/api/v1/school/permissions");
  const [typed, setTyped] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");

  const items = useMemo(() => {
    const q = typed.trim().toLowerCase();
    return (roles.data ?? []).filter(
      (r) =>
        (!q || `${r.name} ${r.code} ${r.description ?? ""}`.toLowerCase().includes(q)) &&
        (!kind || (kind === "system") === r.is_system) &&
        (!status || (status === "active") === r.is_active),
    );
  }, [roles.data, typed, kind, status]);

  const total = perms.data?.length;
  const all = roles.data ?? [];
  const custom = all.filter((r) => !r.is_system);
  const n = (v: number) => (roles.loading && !roles.data ? (roles.loading ? "…" : "—") : String(v));
  const stats = [
    { label: "Roles", value: n(all.length), note: `${all.length - custom.length} built-in` },
    { label: "Custom roles", value: n(custom.length), note: `${custom.filter((r) => !r.is_active).length} inactive` },
    { label: "Assigned", value: n(custom.reduce((t, r) => t + r.users, 0)), note: "People given a custom role" },
    { label: "Permissions", value: perms.loading && !perms.data ? (perms.loading ? "…" : "—") : String(total ?? 0), note: "Available to grant" },
  ];

  const rows: Row[] = items.map((r) => [
    { name: r.name, sub: `${roleKind(r)} · ${r.code}` },
    r.description ?? "—",
    r.users.toLocaleString("en-IN"),
    signsInAs(r),
    total !== undefined && r.permissions.length === total ? `All ${total}` : `${r.permissions.length}${total !== undefined ? ` of ${total}` : ""}`,
    r.is_active ? "Active" : "Inactive",
  ]);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search roles…" aria-label="Search roles" />
        </div>
        <select aria-label="Filter by kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All roles</option>
          <option value="system">Built-in</option>
          <option value="custom">Custom</option>
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{roles.error ?? perms.error}</ErrorNote>
      <Panel title="All roles" sub={`Each role is a set of permissions granted on top of a sign-in${roles.loading ? " · Loading…" : ""}`} flush>
        {/* "Users" counts people given the role through User Role Assignment, not everyone who signs in with that portal. */}
        <DataTable
          columns={["Role", "Description", "Users", "Signs in as", "Permissions", "Status"]}
          rows={rows}
          onView={(i) => router.push(`${routeOf(286)}?id=${items[i].id}`)}
          empty={roles.loading ? "Loading roles…" : typed || kind || status ? "No roles match these filters." : undefined}
          emptyState={{
            title: "No roles yet",
            note: "A role is a set of permissions granted on top of a sign-in; create one to control what staff can see and do.",
            action: (
              <Link href={`${routeOf(286)}?new=1`} className="btn primary">
                <Icon name="plus" className="sm" />
                Create role
              </Link>
            ),
          }}
        />
      </Panel>
    </>
  );
}
