"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { useApi } from "@/lib/useApi";
import { useHydrated, useSession } from "@/lib/useSession";
import { Lesson, WeekGrid, toneOf, weekLabel } from "./shared";
import type { DayView, TeacherWeek } from "./types";

type Slot = { day_of_week: number; period_number: number; start_time: string; end_time: string; label: string | null; is_break: boolean };

/**
 * SCR-126. A teacher sees their own week (GET /teacher/timetable). The office
 * picks a teacher and sees their week, read off the day-by-day view of every
 * section (GET /school/timetable-gen/coordinator?day_of_week=1…6).
 */
export function TeacherTimetable() {
  const hydrated = useHydrated();
  const role = useSession()?.user.role;
  if (!hydrated) return <Loading what="Loading the timetable…" />;
  return role === "teacher" ? <MyWeek /> : <AnyTeacherWeek />;
}

function MyWeek() {
  const me = useSession()?.user;
  const week = useApi<TeacherWeek>("/api/v1/teacher/timetable");
  const items = useMemo(() => week.data?.by_day.flatMap((d) => d.items) ?? [], [week.data]);
  const slots: Slot[] = items.map((i) => ({ day_of_week: i.day_of_week, period_number: i.period_number, start_time: i.start_time, end_time: i.end_time, label: i.period_label, is_break: i.is_break }));
  const at = (d: number, n: number) => items.find((i) => i.day_of_week === d && i.period_number === n);
  const lastDay = Math.max(5, ...items.map((i) => i.day_of_week));

  return (
    <>
      <ErrorNote>{week.error}</ErrorNote>
      <Panel title={weekLabel(lastDay)} sub={`${me?.full_name ?? "My timetable"} · ${week.data ? `${week.data.total_entries} lessons a week` : "Loading…"}`} flush>
        <div className="table-wrap">
          {week.loading && !week.data ? (
            <div className="panel-pad muted">Loading your week…</div>
          ) : (
            <WeekGrid
              slots={slots}
              empty="No lessons are timetabled for you yet."
              cell={(d, _, n) => {
                const l = at(d, n);
                return l ? <Lesson tone={toneOf(l.subject_code)} title={l.subject_name} lines={[l.section_label, l.notes]} /> : null;
              }}
            />
          )}
        </div>
      </Panel>
    </>
  );
}

const DAYS = [1, 2, 3, 4, 5, 6];

function AnyTeacherWeek() {
  // One request per weekday; the list is fixed so the hooks stay in order.
  const views = [
    useApi<DayView>("/api/v1/school/timetable-gen/coordinator", { day_of_week: 1 }),
    useApi<DayView>("/api/v1/school/timetable-gen/coordinator", { day_of_week: 2 }),
    useApi<DayView>("/api/v1/school/timetable-gen/coordinator", { day_of_week: 3 }),
    useApi<DayView>("/api/v1/school/timetable-gen/coordinator", { day_of_week: 4 }),
    useApi<DayView>("/api/v1/school/timetable-gen/coordinator", { day_of_week: 5 }),
    useApi<DayView>("/api/v1/school/timetable-gen/coordinator", { day_of_week: 6 }),
  ];
  const loading = views.some((v) => v.loading && !v.data);
  const error = views.find((v) => v.error)?.error;
  const data = views.map((v) => v.data);

  const names = new Set<string>();
  data.forEach((d) => d?.sections.forEach((s) => Object.values(s.lessons).forEach((l) => l.teacher_name && names.add(l.teacher_name))));
  const teachers = Array.from(names).sort();
  const [teacher, setTeacher] = useState("");
  useEffect(() => {
    if (!teacher && teachers.length) setTeacher(teachers[0]);
  }, [teachers, teacher]);

  const slots: Slot[] = [];
  data.forEach((d, i) => d?.periods.forEach((p) => slots.push({ ...p, day_of_week: DAYS[i] })));
  const lessonsAt = (day: number, n: number) =>
    (data[day - 1]?.sections ?? []).flatMap((s) => {
      const l = s.lessons[String(n)];
      return l && l.teacher_name === teacher ? [{ ...l, section: s.label }] : [];
    });
  const count = DAYS.reduce((sum, d) => sum + (data[d - 1]?.periods ?? []).reduce((k, p) => k + lessonsAt(d, p.period_number).length, 0), 0);
  const lastDay = Math.max(5, ...slots.map((s) => s.day_of_week));

  return (
    <>
      <div className="filterbar">
        <select aria-label="Teacher" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
          {!teachers.length ? <option value="">{loading ? "Loading teachers…" : "No teacher has lessons yet"}</option> : null}
          {teachers.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Panel title={weekLabel(lastDay)} sub={teacher ? `${teacher} · ${count} lessons a week` : "Choose a teacher"} flush>
        <div className="table-wrap">
          {loading ? (
            <div className="panel-pad muted">Loading the week…</div>
          ) : (
            <WeekGrid
              slots={slots}
              empty="No periods are set up yet."
              cell={(d, p, n) => {
                if (!p) return null;
                if (p.is_break) return null;
                return lessonsAt(d, n).map((l, i) => <Lesson key={i} tone={toneOf(l.subject_name)} title={l.subject_name} lines={[l.section, l.room_name]} />);
              }}
            />
          )}
        </div>
      </Panel>
    </>
  );
}
