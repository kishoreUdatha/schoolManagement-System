"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { downloadCsv, usePageAction } from "./planKit";
import type { LessonPlan, PlanStatus } from "./planTypes";

export const PLAN_STATUS: Record<PlanStatus, string> = { draft: "Draft", submitted: "Pending review", approved: "Approved", returned: "Returned" };

/** "Approved", or "Approved · Taught" once delivered. */
export const planStatusText = (p: LessonPlan) => `${PLAN_STATUS[p.status]}${p.delivered_on ? " · Taught" : ""}`;

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** SCR-102, live: GET /api/v1/school/lesson-plans (status, start, end). A teacher sees their own plans; admins see everyone's. */
export function LessonPlanList() {
  const router = useRouter();
  const role = useSession()?.user.role;
  const [status, setStatus] = useState("");
  const [section, setSection] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const list = useApi<LessonPlan[]>("/api/v1/school/lesson-plans", { status, start: from, end: from ? addDays(from, 6) : "" });

  const all = useMemo(() => list.data ?? [], [list.data]);
  const sections = useMemo(() => Array.from(new Set(all.map((p) => p.section_label))).sort(), [all]);
  const q = search.trim().toLowerCase();
  const shown = all.filter(
    (p) =>
      (!section || p.section_label === section) &&
      (!q || [p.title, p.subject_name, p.teacher_name, p.section_label].some((v) => v.toLowerCase().includes(q))),
  );

  const n = (v: number) => (list.loading && !list.data ? (list.loading ? "…" : "—") : String(v));
  const approved = all.filter((p) => p.status === "approved");
  const stats = [
    { label: "Lesson plans", value: n(all.length), note: from ? `week of ${date(from)}` : "all dates" },
    { label: "Pending review", value: n(all.filter((p) => p.status === "submitted").length), note: "awaiting approval" },
    { label: "Returned", value: n(all.filter((p) => p.status === "returned").length), note: "need changes" },
    { label: "Taught", value: n(approved.filter((p) => p.delivered_on).length), note: `of ${approved.length} approved` },
  ];

  const rows: Row[] = shown.map((p) => [p.title, p.subject_name, p.section_label, p.teacher_name, `${date(p.plan_date)} · ${p.periods} period${p.periods > 1 ? "s" : ""}`, planStatusText(p)]);

  const exportCsv = useCallback(
    () =>
      downloadCsv(
        "lesson-plans.csv",
        ["Lesson plan", "Subject", "Class", "Teacher", "Date", "Periods", "Status", "Taught on"],
        shown.map((p) => [p.title, p.subject_name, p.section_label, p.teacher_name, p.plan_date, p.periods, PLAN_STATUS[p.status], p.delivered_on]),
      ),
    [shown],
  );
  usePageAction("lesson-plans:export", exportCsv);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lesson plans…" aria-label="Search lesson plans" />
        </div>
        <select aria-label="Filter by class" value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="">All classes</option>
          {sections.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(PLAN_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="btn" style={{ gap: 8 }}>
          <Icon name="calendar" className="sm" />
          <span>Week from</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Week starting" style={{ border: 0, background: "transparent", font: "inherit" }} />
        </label>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel flush>
        <DataTable
          columns={["Lesson plan", "Subject", "Class", "Teacher", "Week", "Status"]}
          rows={rows}
          onView={(i) => router.push(`${routeOf(103)}?id=${shown[i].id}`)}
          empty={list.loading ? "Loading lesson plans…" : all.length ? "No lesson plans match these filters." : undefined}
          emptyState={{
            title: "No lesson plans yet",
            note: "Lesson plans set out what each class period covers, so create the first one to get started.",
            action: (
              <Link href={routeOf(103)} className="btn primary">
                Create lesson plan
              </Link>
            ),
          }}
        />
      </Panel>
    </>
  );
}
