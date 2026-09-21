"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { ROLE_LABEL, type WorkloadReport } from "./types";

const COLUMNS = ["Teacher", "Teaching periods", "Subjects", "Sections", "Class teacher of", "Homework set"];

/**
 * SCR-086, live: GET /api/v1/school/staff-ops/workload. Periods come from the
 * timetable; there is no capacity figure, so nobody is flagged overloaded.
 */
export function TeacherWorkload() {
  const router = useRouter();
  const res = useApi<WorkloadReport>("/api/v1/school/staff-ops/workload");
  const [typed, setTyped] = useState("");
  const [scope, setScope] = useState("teaching");

  const d = res.data;
  const q = typed.trim().toLowerCase();
  const list = useMemo(
    () =>
      (d?.staff ?? [])
        .filter((s) => scope === "all" || (scope === "teaching" ? s.role === "teacher" : s.periods_per_week === 0))
        .filter((s) => !q || `${s.full_name} ${s.employee_no}`.toLowerCase().includes(q))
        .sort((a, b) => b.periods_per_week - a.periods_per_week),
    [d, scope, q],
  );
  const n = (v: number | null | undefined, digits = 0) => (v === undefined ? "…" : v === null ? "—" : v.toFixed(digits));
  const stats = [
    { label: "Teachers", value: n(d?.teaching_count), note: "Teaching staff" },
    { label: "Average periods", value: n(d ? (d.teaching_count ? d.total_periods / d.teaching_count : 0) : undefined, 1), note: "Per teacher, per week" },
    { label: "Median periods", value: n(d?.median_periods, 1), note: "Per week" },
    { label: "Without timetable", value: n(d?.without_timetable), note: "Staff with no periods" },
  ];
  const rows: Row[] = list.map((s) => [
    { name: s.full_name, sub: `${s.designation ?? ROLE_LABEL[s.role]} · ${s.employee_no}` },
    String(s.periods_per_week),
    String(s.subjects_taught),
    String(s.sections_taught),
    s.class_teacher_of.map((c) => c.label).join(", ") || "—",
    String(s.homework_set),
  ]);

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search teacher workload…" aria-label="Search staff" />
        </div>
        <select aria-label="Who to show" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="teaching">Teachers</option>
          <option value="none">Staff without periods</option>
          <option value="all">All staff</option>
        </select>
      </div>
      <ErrorNote>{res.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <Panel title="Teaching workload" sub="Periods per week from the published timetable" flush>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          selectable={false}
          onView={(i) => router.push(`${routeOf(82)}?id=${list[i].staff_id}`)}
          empty={res.loading ? "Loading workload…" : "No staff match."}
        />
      </Panel>
      {/* Not wired: substitutions, other duties and capacity — the API computes periods only and holds no capacity. */}
    </>
  );
}
