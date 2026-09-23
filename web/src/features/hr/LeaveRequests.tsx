"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { LeaveType, StaffLeave, StaffMember } from "./types";
import { Dialog, Field, NewLink, today, useNewFlag } from "./ui";

/**
 * SCR-181, live: GET /api/v1/school/staff-leaves (status filter) with the
 * leave types for names. Every request across staff; "View" opens it on
 * Leave Approval. "Request leave" (page head, ?new=1) files one on a staff
 * member's behalf with POST /staff-leaves; it stays pending until decided.
 */
export function LeaveRequests() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [typed, setTyped] = useState("");
  const list = useApi<StaffLeave[]>("/api/v1/school/staff-leaves", { status });
  const types = useApi<LeaveType[]>("/api/v1/school/hr/leave-types");
  const [filing, closeFiling] = useNewFlag();
  const staff = useApi<StaffMember[]>(filing ? "/api/v1/school/staff" : null, { status: "active" });
  const [busy, setBusy] = useState(false);
  const [fileErr, setFileErr] = useState<string | null>(null);

  async function fileLeave(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const typeId = text("leave_type_id");
    setBusy(true);
    setFileErr(null);
    try {
      await api.post("/api/v1/school/staff-leaves", {
        applicant_user_id: Number(text("applicant_user_id")),
        leave_type_id: typeId ? Number(typeId) : null,
        kind: typeId ? undefined : "other",
        from_date: text("from_date"),
        to_date: text("to_date") || text("from_date"),
        reason: text("reason") || null,
      });
      notify("Leave filed. It is pending until it is decided on Leave Approval.");
      closeFiling();
      list.reload();
    } catch (x) {
      setFileErr(errorText(x));
    } finally {
      setBusy(false);
    }
  }

  const typeName = (l: StaffLeave) => types.data?.find((t) => t.id === l.leave_type_id)?.name ?? `${label(l.kind)} leave`;

  const roles = Array.from(new Set((list.data ?? []).map((l) => l.applicant_role).filter(Boolean))) as string[];
  const items = useMemo(() => {
    const q = typed.trim().toLowerCase();
    return (list.data ?? []).filter((l) => (!role || l.applicant_role === role) && (!q || [l.applicant_name, l.reason].some((v) => v?.toLowerCase().includes(q))));
  }, [list.data, role, typed]);

  // Counts follow the status chosen (the server filters by it), not the search.
  const all = list.data ?? [];
  const approved = all.filter((l) => l.status === "approved");
  const n = (v: number) => (list.loading && !list.data ? (list.loading ? "…" : "—") : String(v));
  const stats = [
    { label: "Requests", value: n(all.length), note: `${all.filter((l) => l.status === "rejected" || l.status === "cancelled").length} rejected or cancelled` },
    { label: "Pending", value: n(all.filter((l) => l.status === "pending").length), note: "Waiting for a decision" },
    { label: "On leave today", value: n(approved.filter((l) => l.from_date <= today() && l.to_date >= today()).length), note: "Approved leave covering today" },
    { label: "Days approved", value: n(approved.reduce((t, l) => t + Number(l.days), 0)), note: `${approved.length} approved request(s)` },
  ];

  const rows: Row[] = items.map((l) => [
    { name: l.applicant_name ?? "—", sub: l.filed_by_name ? `${label(l.applicant_role)} · filed by ${l.filed_by_name}` : label(l.applicant_role) },
    typeName(l),
    date(l.from_date),
    date(l.to_date),
    String(l.days),
    label(l.status),
  ]);

  return (
    <>
      <StatStrip items={stats} compact />
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
          empty={list.loading ? "Loading leave requests…" : typed || role || status ? "No request matches these filters." : undefined}
          emptyState={{
            title: "No leave requests yet",
            note: "Leave staff request, or that you file on their behalf, appears here until it is approved or declined.",
            action: <NewLink icon="plus">Request leave</NewLink>,
          }}
        />
      </Panel>

      {filing ? (
        <Dialog title="Request leave for a member of staff" onClose={closeFiling} onSubmit={fileLeave} submit="File leave" busy={busy} error={fileErr}>
          <div className="form-grid">
            <Field label="Employee" required full>
              <select name="applicant_user_id" required defaultValue="">
                <option value="">{staff.loading ? "Loading staff…" : "Choose a member of staff"}</option>
                {staff.data?.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {`${m.full_name} · ${m.employee_no}`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Leave type">
              <select name="leave_type_id" defaultValue="">
                <option value="">Other (no balance used)</option>
                {types.data
                  ?.filter((t) => t.is_active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="From" required>
              <input name="from_date" type="date" required defaultValue={today()} />
            </Field>
            <Field label="To">
              <input name="to_date" type="date" />
            </Field>
            <Field label="Reason" full>
              <textarea name="reason" rows={3} maxLength={2000} placeholder="e.g. Phoned in unwell" />
            </Field>
          </div>
          <p className="muted small">The request is recorded as filed by you and waits on Leave Approval like any other.</p>
        </Dialog>
      ) : null}
    </>
  );
}
