"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import type { AcademicYear, SchoolClass } from "@/features/students/types";
import { money } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { FeeHead, FeeStructure } from "./types";

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** SCR-155, live: GET /school/fees/structures for a year, with classes and heads to name them. */
export function FeeStructureList() {
  const router = useRouter();
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const [yearId, setYearId] = useState<number | null>(null);
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);

  const ready = yearId !== null;
  const classes = useApi<SchoolClass[]>(ready ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const structures = useApi<FeeStructure[]>(ready ? "/api/v1/school/fees/structures" : null, { academic_year_id: yearId, class_id: classId });
  const heads = useApi<FeeHead[]>("/api/v1/school/fees/heads");

  const className = useMemo(() => new Map((classes.data ?? []).map((c) => [c.id, c.name])), [classes.data]);
  const headActive = useMemo(() => new Map((heads.data ?? []).map((h) => [h.id, h.is_active])), [heads.data]);
  const year = years.data?.find((y) => y.id === yearId);

  const items = (structures.data ?? [])
    .filter((s) => {
      const term = q.trim().toLowerCase();
      if (term && !`${s.fee_head_name} ${s.fee_head_code} ${className.get(s.class_id) ?? ""}`.toLowerCase().includes(term)) return false;
      const active = headActive.get(s.fee_head_id) !== false;
      if (status === "active" && !active) return false;
      if (status === "inactive" && active) return false;
      return true;
    })
    .sort((a, b) => (className.get(a.class_id) ?? "").localeCompare(className.get(b.class_id) ?? "", undefined, { numeric: true }) || a.fee_head_name.localeCompare(b.fee_head_name));

  // Over the year (and class, if one is chosen), before search and status.
  const all = structures.data ?? [];
  const n = (v: number) => (structures.data ? v.toLocaleString("en-IN") : "…");
  const stats = [
    { label: "Structure lines", value: n(all.length), note: `One per class and fee head${year ? ` · ${year.name}` : ""}` },
    { label: "Classes covered", value: n(new Set(all.map((s) => s.class_id)).size), note: classes.data ? `Of ${classes.data.length} classes` : "Have a fee structure" },
    { label: "Fee heads", value: n(new Set(all.map((s) => s.fee_head_id)).size), note: "Used in the structures" },
    { label: "Monthly", value: n(all.filter((s) => s.is_recurring).length), note: "Lines charged every month" },
  ];

  const rows: Row[] = items.map((s) => [
    `${s.fee_head_name} · ${s.fee_head_code}`,
    year?.name ?? "—",
    className.get(s.class_id) ?? "—",
    money(s.amount),
    `${s.is_recurring ? "Monthly" : "Once"} · due ${ordinal(s.due_day_of_month)}`,
    headActive.get(s.fee_head_id) === false ? "Inactive" : "Active",
  ]);

  return (
    <>
      <StatStrip items={years.data?.length === 0 ? stats.map((x) => ({ ...x, value: "—" })) : stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fee structure…" aria-label="Search records" />
        </div>
        <select aria-label="Filter by class" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select aria-label="Academic year" value={yearId ?? ""} onChange={(e) => setYearId(Number(e.target.value))}>
          {years.data?.map((y) => (
            <option key={y.id} value={y.id}>
              {`${y.name}${y.is_current ? " (current)" : ""}`}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{years.error ?? structures.error ?? classes.error}</ErrorNote>
      <Panel title="All records" sub={`${year ? `Academic year ${year.name}` : "Current academic year"} · one line per class and fee head${structures.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Structure", "Academic year", "Class", "Amount per charge", "Frequency", "Status"]}
          rows={rows}
          onView={(i) => router.push(`${routeOf(156)}?year=${items[i].academic_year_id}&class=${items[i].class_id}`)}
          empty={structures.loading ? "Loading fee structures…" : q || classId || status ? "No fee structures match these filters." : "No fee structures for this academic year yet."}
        />
      </Panel>
    </>
  );
}
