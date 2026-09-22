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
import { ROLE_LABEL, type OnlyStaff, type WorkloadReport } from "./types";

const COLUMNS = ["Teacher", "Teaching periods", "Substitutions", "Other duties", "Total", "Capacity", "Class teacher of"];

/**
 * SCR-086, live: GET /api/v1/school/staff-ops/workload. Teaching periods come
 * from the timetable, substitutions from this week's cover register; other
 * duties and capacity are set on the staff record (Edit Staff). Someone is
 * over capacity only against the capacity the school set for them. With
 * `only` (the staff profile's Workload tab) it shows just that person's row,
 * without the school-wide filters and counts.
 */
export function TeacherWorkload({ only }: { only?: OnlyStaff }) {
  const router = useRouter();
  const res = useApi<WorkloadReport>("/api/v1/school/staff-ops/workload");
  const [typed, setTyped] = useState("");
  const [scope, setScope] = useState("teaching");

  const d = res.data;
  const q = typed.trim().toLowerCase();
  const list = useMemo(
    () =>
      (d?.staff ?? [])
        .filter((s) => !only || s.staff_id === only.staffId)
        .filter((s) => only || scope === "all" || (scope === "teaching" ? s.role === "teacher" : s.periods_per_week === 0))
        .filter((s) => !q || `${s.full_name} ${s.employee_no}`.toLowerCase().includes(q))
        .sort((a, b) => b.periods_per_week - a.periods_per_week),
    [d, scope, q, only],
  );
  const n = (v: number | null | undefined, digits = 0) => (v === undefined ? "…" : v === null ? "—" : v.toFixed(digits));
  const stats = [
    { label: "Teachers", value: n(d?.teaching_count), note: "Teaching staff" },
    { label: "Average periods", value: n(d ? (d.teaching_count ? d.total_periods / d.teaching_count : 0) : undefined, 1), note: "Per teacher, per week" },
    { label: "Over capacity", value: n(d?.over_capacity), note: d ? `${d.without_capacity} with no capacity set` : "Against their own capacity" },
    { label: "Without timetable", value: n(d?.without_timetable), note: `Median ${n(d?.median_periods, 1)} periods` },
  ];
  const rows: Row[] = list.map((s) => [
    { name: s.full_name, sub: `${s.designation ?? ROLE_LABEL[s.role]} · ${s.employee_no}` },
    String(s.periods_per_week),
    String(s.substitutions_this_week),
    [s.other_duty_periods ? String(s.other_duty_periods) : s.other_duties ? "" : "0", s.other_duties].filter(Boolean).join(" · "),
    s.over_capacity ? `${s.total_periods} · over capacity` : String(s.total_periods),
    s.capacity === null ? "Not set" : String(s.capacity),
    s.class_teacher_of.map((c) => c.label).join(", ") || "—",
  ]);

  return (
    <>
      {only ? null : (
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
      )}
      <ErrorNote>{res.error}</ErrorNote>
      {only ? null : <StatStrip items={stats} compact />}
      <Panel title="Teaching workload" sub="Periods per week · substitutions this week · capacity and other duties are set on Edit Staff" flush>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          selectable={false}
          rowAction={!only}
          onView={(i) => router.push(`${routeOf(82)}?id=${list[i].staff_id}`)}
          empty={res.loading ? "Loading workload…" : only ? `No workload recorded for ${only.name}.` : "No staff match."}
        />
      </Panel>
    </>
  );
}
