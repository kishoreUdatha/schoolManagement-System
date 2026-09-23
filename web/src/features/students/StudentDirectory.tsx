"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import type { Paginated } from "@/lib/api";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { AcademicYear, SchoolClass, Student } from "./types";

const PAGE_SIZE = 25;

/** SCR-055, live: GET /api/v1/school/students with year, class, status and search. */
export function StudentDirectory() {
  const router = useRouter();
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const [yearId, setYearId] = useState<number | null>(null);
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState("");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Default to the school's current year once the list arrives.
  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);

  // Search as you type, a moment after you stop.
  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  useEffect(() => setPage(1), [yearId, classId, status, search]);

  const ready = yearId !== null;
  const classes = useApi<SchoolClass[]>(ready ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const list = useApi<Paginated<Student>>(ready ? "/api/v1/school/students" : null, {
    academic_year_id: yearId,
    class_id: classId,
    status,
    search,
    page,
    page_size: PAGE_SIZE,
  });
  const allCount = useApi<Paginated<Student>>(ready ? "/api/v1/school/students" : null, { academic_year_id: yearId, page_size: 1 });
  const activeCount = useApi<Paginated<Student>>(ready ? "/api/v1/school/students" : null, { academic_year_id: yearId, status: "active", page_size: 1 });

  const sectionOf = useMemo(() => {
    const m = new Map<number, { cls: string; sec: string }>();
    classes.data?.forEach((c) => c.sections.forEach((s) => m.set(s.id, { cls: c.name, sec: s.name })));
    return m;
  }, [classes.data]);

  const year = years.data?.find((y) => y.id === yearId);
  const sectionCount = classes.data?.reduce((n, c) => n + c.sections.length, 0);
  const n = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString("en-IN"));
  const total = allCount.data?.total;
  const active = activeCount.data?.total;

  const stats = [
    { label: "Total students", value: n(total), note: year ? `${year.name} academic year` : "Current academic year" },
    { label: "Active students", value: n(active), note: total && active !== undefined ? `${((active / total) * 100).toFixed(1)}% of enrolled` : "Currently enrolled" },
    { label: "Classes", value: n(classes.data?.length), note: "In this academic year" },
    { label: "Sections", value: n(sectionCount), note: "Across all classes" },
  ];

  const items = list.data?.items ?? [];
  const rows: Row[] = items.map((s) => {
    const where = sectionOf.get(s.section_id);
    return [
      { name: s.full_name, sub: s.admission_no },
      s.admission_no,
      where?.cls ?? "—",
      where?.sec ?? "—",
      s.roll_no ? String(s.roll_no) : "—",
      s.is_active ? "Active" : "Inactive",
    ];
  });

  const error = years.error ?? list.error ?? classes.error;

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by name or admission number…" aria-label="Search students" />
        </div>
        <select aria-label="Filter by class" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
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
      {error ? (
        <div className="tip warn" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="bell" className="sm" />
          <span>{error}</span>
        </div>
      ) : null}
      <Panel
        title="All students"
        sub={`${year ? `Academic year ${year.name}` : "Current academic year"}${list.loading ? " · Loading…" : ""}`}
        flush
      >
        <DataTable
          columns={["Student", "Admission no.", "Class", "Section", "Roll no.", "Status"]}
          rows={rows}
          total={list.data?.total}
          page={page}
          pages={list.data?.pages ?? 1}
          onPage={setPage}
          onView={(i) => router.push(`${routeOf(57)}?id=${items[i].id}`)}
          empty={list.loading ? "Loading students…" : search || classId || status ? "No students match these filters." : undefined}
          emptyState={{
            title: "No students yet",
            note: "Students are admitted into a section of a class; add the first one to start the register.",
            action: (
              <Link href="/students/add-student" className="btn primary">
                <Icon name="plus" className="sm" />
                Add student
              </Link>
            ),
          }}
        />
      </Panel>
    </>
  );
}
