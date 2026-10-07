"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { jobRolesOf, ROLE_LABEL, type JobRole, type Staff, type StaffLeave, type StaffRole } from "./types";
import { downloadCsv, todayIso } from "./util";

const COLUMNS = ["Staff member", "Employee no.", "Department", "Designation", "Joining date", "Status"];

/** SCR-080, live: GET /api/v1/school/staff with role, status and search. */
export function StaffDirectory() {
  const router = useRouter();
  // a login type ("teacher"), or a job role as "job:<id>"
  const [role, setRole] = useState<string>("");
  const [status, setStatus] = useState("");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const jobId = role.startsWith("job:") ? Number(role.slice(4)) : undefined;
  const list = useApi<Staff[]>("/api/v1/school/staff", { role: jobId ? "" : role, job_role_id: jobId, status, search });
  const isAdmin = useSession()?.user.role === "school_admin";
  const roles = useApi<JobRole[]>(isAdmin ? "/api/v1/school/roles" : null);
  const all = useApi<Staff[]>("/api/v1/school/staff");
  // the roles list is the school admin's; anyone else filters by the jobs the staff hold
  const jobs: JobRole[] = isAdmin
    ? jobRolesOf(roles.data)
    : [...new Map((all.data ?? []).flatMap((s) => s.job_roles ?? []).map((j) => [j.id, { ...j, base_role: "", is_system: false, is_active: true, description: null }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const approved = useApi<StaffLeave[]>("/api/v1/school/staff-leaves", { status: "approved" });

  const today = todayIso();
  const everyone = all.data;
  const onLeave = approved.data ? new Set(approved.data.filter((l) => l.from_date <= today && l.to_date >= today).map((l) => l.applicant_user_id)) : null;
  const n = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString("en-IN"));

  const stats = [
    { label: "All staff", value: n(everyone?.length), note: "Every role, active or not" },
    { label: "Teaching staff", value: n(everyone?.filter((s) => s.role === "teacher" && s.is_active).length), note: "Active teachers" },
    { label: "Non-teaching", value: n(everyone?.filter((s) => s.role !== "teacher" && s.is_active).length), note: "Office, accounts and support" },
    { label: "On leave today", value: n(onLeave?.size), note: date(today) },
  ];

  const items = list.data ?? [];
  const cells = (s: Staff) => [
    s.employee_no,
    s.department_name ?? "—",
    s.designation ?? s.job_roles?.[0]?.name ?? ROLE_LABEL[s.role] ?? "—",
    date(s.joining_date),
    !s.is_active ? "Inactive" : onLeave?.has(s.user_id) ? "On leave" : "Active",
  ];
  // the job (Librarian) says more than the login type (Non-teaching staff)
  const job = (s: Staff) => (s.job_roles?.length ? s.job_roles.map((j) => j.name).join(", ") : ROLE_LABEL[s.role]);
  const rows: Row[] = items.map((s) => [{ name: s.full_name, sub: [job(s), s.email].filter(Boolean).join(" · ") }, ...cells(s)]);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by name, email or employee no.…" aria-label="Search staff" />
        </div>
        <select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          <optgroup label="Signs in as">
            {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </optgroup>
          {jobs.length ? (
            <optgroup label="Job role">
              {jobs.map((j) => (
                <option key={j.id} value={`job:${j.id}`}>
                  {j.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <span className="filter-count">{list.loading ? "Loading…" : `${items.length} shown`}</span>
        <button
          type="button"
          className="btn"
          disabled={!items.length}
          onClick={() => downloadCsv("staff-directory.csv", ["Name", "Signs in as", "Job role", "Email", "Phone", ...COLUMNS.slice(1)], items.map((s) => [s.full_name, ROLE_LABEL[s.role], (s.job_roles ?? []).map((j) => j.name).join(", "), s.email ?? "", s.phone ?? "", ...cells(s)]))}
        >
          <Icon name="download" className="sm" />
          Export
        </button>
      </div>
      <ErrorNote>{list.error ?? all.error}</ErrorNote>
      <Panel flush>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          onView={(i) => router.push(`${routeOf(82)}?id=${items[i].id}`)}
          empty={list.loading ? "Loading staff…" : search || role || status ? "No staff match these filters." : undefined}
          emptyState={{
            title: "No staff yet",
            note: "Add a member of staff to start building the directory.",
            action: (
              <Link href="/staff/add-staff" className="btn primary">
                <Icon name="plus" className="sm" />
                Add staff
              </Link>
            ),
          }}
        />
      </Panel>
    </>
  );
}
