"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { date, label } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { SchoolClass } from "@/features/students/types";
import { appClass, APPS, downloadCsv, useOnAction, useYears } from "./shared";
import { APPLICATION_STATUSES, type Application } from "./types";

const PAGE_SIZE = 25;

/**
 * SCR-048, live: GET /admissions/applications (status, search,
 * academic_year_id). The API returns the whole list, so the class filter and
 * paging run here.
 */
export function ApplicationList() {
  const router = useRouter();
  const years = useYears();
  const [yearId, setYearId] = useState<number | null>(null);
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState("");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (yearId === null && years.current) setYearId(years.current.id);
  }, [years.current, yearId]);
  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);
  useEffect(() => setPage(1), [yearId, classId, status, search]);

  const ready = yearId !== null;
  const classes = useApi<SchoolClass[]>(ready ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const list = useApi<Application[]>(ready ? APPS : null, { academic_year_id: yearId, status, search });

  const all = (list.data ?? []).filter((a) => !classId || String(a.class_id) === classId);
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const items = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useOnAction("export-applications", () =>
    downloadCsv(
      "applications.csv",
      ["Application", "Student", "Applying for", "Guardian", "Mobile", "Submitted on", "Documents verified", "Documents", "Status"],
      all.map((a) => [a.application_no, a.student_name, appClass(a), a.guardian_name, a.phone, a.submitted_at?.slice(0, 10), a.documents_verified, a.documents_total, label(a.status)]),
    ),
  );

  const rows: Row[] = items.map((a) => [
    a.application_no,
    { name: a.student_name, sub: a.guardian_name },
    appClass(a),
    a.submitted_at ? date(a.submitted_at) : "Not submitted",
    a.documents_total ? `${a.documents_verified} / ${a.documents_total} verified` : "—",
    label(a.status),
  ]);
  const year = years.data?.find((y) => y.id === yearId);
  // Figures follow the filters on screen.
  const n = (v: number) => (!list.data ? (list.loading ? "…" : "—") : String(v));
  const count = (...s: string[]) => all.filter((a) => s.includes(a.status)).length;
  const docsOpen = all.filter((a) => a.documents_total > a.documents_verified).length;
  const stats = [
    { label: "Applications", value: n(all.length), note: year ? `in ${year.name}` : "this academic year" },
    { label: "To review", value: n(count("submitted", "verification", "assessment")), note: "submitted, verifying or assessing" },
    { label: "Documents pending", value: n(docsOpen), note: "not all verified" },
    { label: "Admitted", value: n(count("admitted")), note: `${count("approved", "fee_pending")} approved, awaiting fee` },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by student, guardian or application no.…" aria-label="Search applications" />
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
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
        <select aria-label="Academic year" value={yearId ?? ""} onChange={(e) => setYearId(Number(e.target.value))}>
          {years.data?.map((y) => (
            <option key={y.id} value={y.id}>
              {`${y.name}${y.is_current ? " (current)" : ""}`}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{list.error ?? years.error}</ErrorNote>
      <Panel title="All records" sub={`${year ? `Academic year ${year.name}` : "Current academic year"}${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Application", "Student", "Applying for", "Submitted on", "Documents", "Status"]}
          rows={rows}
          total={all.length}
          page={page}
          pages={pages}
          onPage={setPage}
          onView={(i) => router.push(`${routeOf(50)}?id=${items[i].id}`)}
          empty={list.loading ? "Loading applications…" : search || status || classId ? "No applications match these filters." : "No applications in this academic year yet."}
        />
      </Panel>
    </>
  );
}
