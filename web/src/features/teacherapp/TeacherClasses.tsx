"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTeacherApp } from "@/components/teacherapp/TeacherShell";
import { useApi } from "@/lib/useApi";
import { hhmm, MY_CLASSES, plural, PmEmpty, PmError, PmLoading, type MyClasses } from "./parts";

type Slot = {
  entry_id: number;
  section_label: string;
  subject_name: string;
  period_number: number;
  start_time: string;
  end_time: string;
  is_break: boolean;
  notes: string | null;
};
type Week = { today_day_of_week: number; by_day: { day_of_week: number; day_label: string; is_today: boolean; items: Slot[] }[] };

/** TM-008. My week, one day at a time. */
export function TeacherTimetable() {
  const tt = useApi<Week>("/api/v1/teacher/timetable");
  const [day, setDay] = useState<number | null>(null);
  useEffect(() => {
    if (tt.data && day === null) setDay(tt.data.today_day_of_week);
  }, [tt.data, day]);

  if (tt.loading && !tt.data) return <PmLoading />;
  if (tt.error) return <PmError>{tt.error}</PmError>;
  const days = (tt.data?.by_day ?? []).filter((d) => d.items.length || d.day_of_week <= 5);
  const cur = days.find((d) => d.day_of_week === day) ?? days[0];

  return (
    <>
      <div className="chip-row">
        {days.map((d) => (
          <button key={d.day_of_week} className={d.day_of_week === cur?.day_of_week ? "on" : ""} onClick={() => setDay(d.day_of_week)}>
            {d.day_label}
            {d.is_today ? " •" : ""}
          </button>
        ))}
      </div>
      {cur && !cur.items.length ? <PmEmpty title={`No classes on ${cur.day_label}`}>Only published timetables show here.</PmEmpty> : null}
      {cur?.items.length ? (
        <div className="panel">
          {cur.items.map((s) => (
            <div className="item" key={s.entry_id}>
              <span>
                <strong>{`${s.subject_name} · ${s.section_label}`}</strong>
                <small className="muted">{`Period ${s.period_number} · ${hhmm(s.start_time)} – ${hhmm(s.end_time)}${s.notes ? ` · ${s.notes}` : ""}`}</small>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

/** TM-009. Sections I am class teacher of, and the classes I teach a subject in. */
export function TeacherMyClasses() {
  const { go } = useTeacherApp();
  const mine = useApi<MyClasses>(MY_CLASSES);
  if (mine.loading && !mine.data) return <PmLoading />;
  if (mine.error) return <PmError>{mine.error}</PmError>;
  const ct = (mine.data?.class_teacher_of ?? []).filter((c) => c.is_current_year);
  const subj = (mine.data?.subject_teacher_of ?? []).filter((s) => s.is_current_year);
  if (!ct.length && !subj.length) return <PmEmpty title="No classes yet">The office assigns your sections and subjects.</PmEmpty>;

  return (
    <>
      {ct.length ? (
        <>
          <div className="section-head">
            <h3>Class teacher of</h3>
          </div>
          <div className="panel">
            {ct.map((c) => (
              <button className="item" key={c.section_id} onClick={() => go(10, `section=${c.section_id}`)}>
                <span>
                  <strong>{c.section_label}</strong>
                  <small className="muted">{plural(c.student_count, "student")}</small>
                </span>
                <span>›</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
      {subj.length ? (
        <>
          <div className="section-head">
            <h3>Subjects I teach</h3>
          </div>
          <div className="panel">
            {subj.flatMap((s) =>
              s.sections.map((x) => (
                <button className="item" key={`${s.class_subject_id}-${x.section_id}`} onClick={() => go(10, `section=${x.section_id}`)}>
                  <span>
                    <strong>{`${s.subject_name} · ${s.class_name} ${x.section_name}`}</strong>
                    <small className="muted">{plural(x.student_count, "student")}</small>
                  </span>
                  <span>›</span>
                </button>
              )),
            )}
          </div>
        </>
      ) : null}
    </>
  );
}

type RosterStudent = { id: number; admission_no: string; roll_no: number; full_name: string; gender: string | null };

/** TM-010. The students of one section I teach. */
export function TeacherClassList() {
  const section = Number(useSearchParams().get("section"));
  const roster = useApi<RosterStudent[]>(section ? `/api/v1/teacher/sections/${section}/students` : null);
  if (!section) return <PmEmpty title="Pick a class">Choose one under My classes.</PmEmpty>;
  if (roster.loading && !roster.data) return <PmLoading />;
  if (roster.error) return <PmError>{roster.error}</PmError>;
  const list = roster.data ?? [];
  return (
    <>
      <p className="micro" style={{ margin: "8px 0" }}>{plural(list.length, "student")}</p>
      <div className="panel">
        {list.map((s) => (
          <div className="item" key={s.id}>
            <span>
              <strong>{`${s.roll_no}. ${s.full_name}`}</strong>
              <small className="muted">{s.admission_no}</small>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
