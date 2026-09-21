"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { addDays, longDay, useSchoolDay } from "./shared";
import type { AcademicYear, PeriodGap, PeriodGaps as Gaps, SchoolClass } from "./types";

type Found = PeriodGap & { section_id: number; section_label: string };

/**
 * NEW-031, live: children marked present (or late) in the morning register
 * who were marked absent from a lesson later that day.
 * GET /api/v1/school/attendance-ops/periods/gaps?section_id&date, once per
 * section of the current year when "All sections" is chosen.
 */
export function PeriodGaps() {
  const schoolDay = useSchoolDay();
  const [day, setDay] = useState<string | null>(null);
  useEffect(() => {
    if (day === null && schoolDay) setDay(schoolDay);
  }, [schoolDay, day]);

  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const yearId = (years.data?.find((y) => y.is_current) ?? years.data?.[0])?.id;
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const sections = useMemo(() => classes.data?.flatMap((c) => c.sections.map((s) => ({ id: s.id, label: `${c.name} ${s.name}` }))) ?? [], [classes.data]);
  const [sectionId, setSectionId] = useState("");
  const [typed, setTyped] = useState("");

  const [found, setFound] = useState<Found[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const targets = useMemo(() => (sectionId ? sections.filter((s) => String(s.id) === sectionId) : sections), [sections, sectionId]);

  useEffect(() => {
    if (!day || !classes.data) return;
    if (!targets.length) {
      setFound([]);
      return;
    }
    let live = true;
    setLoading(true);
    Promise.all(
      targets.map((s) =>
        api.get<Gaps>("/api/v1/school/attendance-ops/periods/gaps", { section_id: s.id, date: day }).then((g) => g.gaps.map((x) => ({ ...x, section_id: s.id, section_label: s.label }))),
      ),
    )
      .then((all) => {
        if (!live) return;
        setFound(all.flat().sort((a, b) => a.section_label.localeCompare(b.section_label) || a.period_number - b.period_number));
        setError(null);
      })
      .catch((e) => live && setError(errorText(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [day, targets, tick, classes.data]);

  if (!day) return <Loading what="Working out the school's day…" />;

  const gaps = found ?? [];
  const q = typed.trim().toLowerCase();
  const rows = gaps.filter((g) => !q || (g.student_name ?? "").toLowerCase().includes(q) || (g.admission_no ?? "").toLowerCase().includes(q));
  const perChild = new Map<number, number>();
  gaps.forEach((g) => perChild.set(g.student_id, (perChild.get(g.student_id) ?? 0) + 1));
  const repeat = [...perChild.values()].filter((n) => n > 1).length;
  const sectionsHit = new Set(gaps.map((g) => g.section_id)).size;

  const stats = [
    { label: "Missed lessons", value: found ? String(gaps.length) : "…", note: longDay(day) },
    { label: "Children", value: found ? String(perChild.size) : "…", note: "In school, missing from a lesson" },
    { label: "Missed two or more", value: found ? String(repeat) : "…", note: "Follow these up first" },
    { label: "Sections", value: found ? `${sectionsHit} / ${targets.length}` : "…", note: "With at least one gap" },
  ];

  const table: Row[] = rows.map((g) => [
    { name: g.student_name ?? `Student ${g.student_id}`, sub: g.admission_no ?? undefined },
    g.section_label,
    g.period_label ? `${g.period_label} (P${g.period_number})` : `Period ${g.period_number}`,
    String(perChild.get(g.student_id) ?? 1),
    g.remark ?? "—",
  ]);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by name or admission number…" aria-label="Search students" />
        </div>
        <select aria-label="Section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          <option value="">All sections</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>
          ‹
        </button>
        <input type="date" className="select-plain" aria-label="Date" value={day} max={schoolDay ?? undefined} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <button type="button" className="btn" aria-label="Next day" disabled={!!schoolDay && day >= schoolDay} onClick={() => setDay(addDays(day, 1))}>
          ›
        </button>
        <button type="button" className="btn" onClick={() => setTick((t) => t + 1)} disabled={loading}>
          Refresh
        </button>
      </div>
      <ErrorNote>{error ?? years.error ?? classes.error}</ErrorNote>
      <Panel title="Unaccounted for" sub={`Marked present in the morning, absent from a lesson · ${longDay(day)}${loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Student", "Section", "Lesson missed", "Lessons missed today", "Remark"]}
          rows={table}
          selectable={false}
          rowAction={false}
          empty={loading || !found ? "Checking the registers…" : q ? "No children match this search." : "No gaps: every child present this morning was in their lessons."}
        />
      </Panel>
      <div className="gap" />
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>
          A child absent all day is not listed here; the day register already shows them. Gaps only appear where lessons were marked on the{" "}
          <Link href={routeOf(111)}>Period / Subject Attendance</Link> screen.
        </span>
      </div>
    </>
  );
}
