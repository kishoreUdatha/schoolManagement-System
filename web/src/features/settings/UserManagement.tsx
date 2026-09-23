"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { KV } from "@/features/setup/bits";
import type { Assignment, StaffUser } from "./types";

import { ask } from "@/lib/dialog";
const STAFF = "/api/v1/school/staff";
/** The roles GET /staff can filter by. */
const ROLES = ["teacher", "staff", "principal", "accountant"];

/**
 * SCR-284, live. Staff sign-ins from GET /staff (role, status and search
 * filters); "View" opens one to activate, deactivate or reset its password
 * (POST /staff/{id}/activate|deactivate|reset-password). The temporary
 * password is shown once, as the API returns it once.
 */
export function UserManagement() {
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const list = useApi<StaffUser[]>(STAFF, { role, status, search });
  const extra = useApi<Assignment[]>("/api/v1/school/role-assignments");
  const [openId, setOpenId] = useState<number | null>(null);
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const items = list.data ?? [];
  const open = items.find((s) => s.id === openId);
  const extraFor = (userId: number) => (extra.data ?? []).filter((a) => a.user_id === userId);

  // Counts follow the filters (the server applies them).
  const n = (v: number) => (list.loading && !list.data ? (list.loading ? "…" : "—") : String(v));
  const stats = [
    { label: "Staff logins", value: n(items.length), note: `${new Set(items.map((s) => s.role)).size} roles` },
    { label: "Active", value: n(items.filter((s) => s.is_active).length), note: "Can sign in" },
    { label: "Inactive", value: n(items.filter((s) => !s.is_active).length), note: "Sign-in turned off" },
    { label: "Never signed in", value: n(items.filter((s) => !s.last_login_at).length), note: "No sign-in recorded" },
  ];

  const rows: Row[] = items.map((s) => [
    { name: s.full_name, sub: s.employee_no },
    s.email ?? "—",
    [label(s.role), ...extraFor(s.user_id).map((a) => a.role_name)].join(" + "),
    s.department_name ?? s.designation ?? "—",
    s.last_login_at ? dateTime(s.last_login_at) : "Never",
    s.is_active ? "Active" : "Inactive",
  ]);

  async function toggle(s: StaffUser) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`${STAFF}/${s.id}/${s.is_active ? "deactivate" : "activate"}`);
      notify(`${s.full_name} ${s.is_active ? "deactivated" : "activated"}.`);
      await list.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset(s: StaffUser) {
    if (!(await ask(`Reset the password for ${s.full_name}? Their current password stops working.`))) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ temporary_password: string }>(`${STAFF}/${s.id}/reset-password`);
      setTemp({ name: s.full_name, password: r.temporary_password });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search user management…" aria-label="Search users" />
        </div>
        <select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {label(r)}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      {temp ? (
        <div className="tip warn" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="bell" className="sm" />
          <span>
            {`${temp.name}'s temporary password is `}
            <b className="mono">{temp.password}</b>
            {". It is shown only once — pass it on before leaving this page. "}
            <button type="button" className="btn" onClick={() => setTemp(null)}>
              Done
            </button>
          </span>
        </div>
      ) : null}
      {open ? (
        <Panel
          title={open.full_name}
          sub={`${label(open.role)} · ${open.employee_no}`}
          action={
            <div className="row">
              <Badge>{open.is_active ? "Active" : "Inactive"}</Badge>
              <button type="button" className="btn" onClick={() => setOpenId(null)}>
                Close
              </button>
            </div>
          }
        >
          <KV
            rows={[
              ["Email address", open.email ?? "—"],
              ["Phone", open.phone ?? "—"],
              ["Designation", open.designation ?? "—"],
              ["Department", open.department_name ?? "—"],
              ["Extra roles", extraFor(open.user_id).map((a) => `${a.role_name}${a.branch_name ? ` (${a.branch_name})` : ""} since ${date(a.assigned_at)}`).join(", ") || "None"],
              ["Last sign-in", open.last_login_at ? dateTime(open.last_login_at) : "Never"],
            ]}
          />
          <div className="gap" />
          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={() => toggle(open)}>
              {open.is_active ? "Deactivate login" : "Activate login"}
            </button>
            <button type="button" className="btn" disabled={busy || !open.is_active} onClick={() => reset(open)}>
              Reset password
            </button>
          </div>
        </Panel>
      ) : null}
      <Panel title="All users" sub={`Staff sign-ins · parent and student logins are managed with their records${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["User", "Email address", "Role", "Department", "Last login", "Status"]}
          rows={rows}
          onView={(i) => {
            setOpenId(items[i].id);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          empty={list.loading ? "Loading users…" : role || status || typed ? "No users match these filters." : undefined}
          emptyState={{
            title: "No users yet",
            note: "Every member of staff signs in as a user; their role decides what they can see.",
            action: (
              <Link href={routeOf(81)} className="btn primary">
                <Icon name="arrow" className="sm" />
                Invite user
              </Link>
            ),
          }}
        />
      </Panel>
    </>
  );
}
