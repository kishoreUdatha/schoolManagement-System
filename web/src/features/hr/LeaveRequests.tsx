"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { date, label } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { LeaveType, StaffLeave } from "./types";

/**
 * SCR-181, live: GET /api/v1/school/staff-leaves (status filter) with the
 * leave types for names. Every request across staff; "View" opens it on
 * Leave Approval.
 */
export function LeaveRequests() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [typed, setTyped] = useState("");
  const list = useApi<StaffLeave[]>("/api/v1/school/staff-leaves", { status });
  const types = useApi<LeaveType[]>("/api/v1/school/hr/leave-types");
  const typeName = (l: StaffLeave) => types.data?.find((t) => t.id === l.leave_type_id)?.name ?? `${label(l.kind)} leave`;

  const roles = Array.from(new Set((list.data ?? []).map((l) => l.applicant_role).filter(Boolean))) as string[];
  const items = useMemo(() => {
    const q = typed.trim().toLowerCase();
    return (list.data ?? []).filter((l) => (!role || l.applicant_role === role) && (!q || [l.applicant_name, l.reason].some((v) => v?.toLowerCase().includes(q))));
  }, [list.data, role, typed]);

  const rows: Row[] = items.map((l) => [
    { name: l.applicant_name ?? "—", sub: label(l.applicant_role) },
    typeName(l),
    date(l.from_date),
    date(l.to_date),
    String(l.days),
    label(l.status),
  ]);

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search staff leave requests…" aria-label="Search leave requests" />
        </div>
        <select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {label(r)}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["pending", "approved", "rejected", "cancelled"].map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel title="All leave requests" sub={`Across every member of staff${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Employee", "Leave type", "From", "To", "Days", "Status"]}
          rows={rows}
          onView={(i) => router.push(`${routeOf(182)}?id=${items[i].id}`)}
          empty={list.loading ? "Loading leave requests…" : typed || role || status ? "No request matches these filters." : "No leave has been requested yet."}
        />
      </Panel>
    </>
  );
}
