"use client";

/*
 * NEW-109, live: a class teacher's view of their own class's attendance.
 * GET /teacher/my-classes, GET /teacher/attendance/class-overview?section_id&year&month:
 * the month's register with each child's percentage, children below the
 * mark (over the term so far), and today's absentees. Read-only; marking is
 * on Mark attendance, corrections go to the office.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { MyClasses } from "./types";

type Row = { student_id: number; admission_no: string; roll_no: number | null; full_name: string; present: number; absent: number; late: number; half_day: number; marked_days: number; attendance_pct: number };
type Risk = { student_id: number; student_name: string; marked_days: number; absent_days: number; percent: number; last_contact_on?: string | null };
type Overview = {
  register: { section_label: string; rows: Row[] };
  below: number;
  at_risk: Risk[];
  today: string;
  absent_today: { student_id: number; full_name: string; roll_no: number | null; remark: string | null }[];
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  a.click();
}

export function ClassAttendance() {
  const mine = useApi<MyClasses>("/api/v1/teacher/my-classes");
  const [sectionId, setSectionId] = useState<number | null>(null);
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [y, m] = ym.split("-").map(Number);
  useEffect(() => {
    if (sectionId === null && mine.data?.class_teacher_of.length) setSectionId(mine.data.class_teacher_of[0].section_id);
  }, [mine.data, sectionId]);
  const r = useApi<Overview>(sectionId ? "/api/v1/teacher/attendance/class-overview" : null, { section_id: sectionId, year: y, month: m });

  if (mine.data && !mine.data.class_teacher_of.length)
    return <Panel><p className="muted">You are not the class teacher of a section, so there is no class register to show.</p></Panel>;
  if (!mine.data) return mine.error ? <ErrorNote>{mine.error}</ErrorNote> : <Loading what="Loading your classes…" />;

  const d = r.data;
  const rows = d?.register.rows ?? [];
  const marked = rows.filter((x) => x.marked_days);
  const avg = marked.length ? Math.round((marked.reduce((t, x) => t + x.attendance_pct, 0) / marked.length) * 10) / 10 : null;
  return (
    <>
      <div className="filterbar">
        <select aria-label="Section" value={sectionId ?? ""} onChange={(e) => setSectionId(Number(e.target.value))}>
          {mine.data.class_teacher_of.map((s) => (
            <option key={s.section_id} value={s.section_id}>
              {s.section_label}
            </option>
          ))}
        </select>
        <input type="month" aria-label="Month" value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} />
        <span style={{ flex: 1 }} />
        <Link className="btn" href={`${routeOf(110)}${sectionId ? `?section_id=${sectionId}` : ""}`}>
          Mark today&apos;s register
        </Link>
        <button
          type="button"
          className="btn"
          disabled={!rows.length}
          onClick={() =>
            downloadCsv(`${d?.register.section_label ?? "class"}-${ym}-attendance.csv`, [
              ["Roll", "Admission no", "Student", "Present", "Late", "Half day", "Absent", "Marked days", "Attendance %"],
              ...rows.map((x) => [x.roll_no ?? "", x.admission_no, x.full_name, x.present, x.late, x.half_day, x.absent, x.marked_days, x.attendance_pct]),
            ])
          }
        >
          Export
        </button>
      </div>
      <ErrorNote>{r.error}</ErrorNote>
      <StatStrip
        compact
        items={[
          { label: "Class average", value: avg === null ? "—" : `${avg}%`, note: `${MONTHS[m - 1]} ${y}` },
          { label: `Below ${d?.below ?? 75}%`, value: d ? String(d.at_risk.length) : "…", note: "Over the term so far" },
          { label: "Absent today", value: d ? String(d.absent_today.length) : "…", note: d ? `of ${rows.length} students` : "" },
        ]}
      />
      {d && (d.at_risk.length || d.absent_today.length) ? (
        <div className="fo-grid" style={{ marginTop: 0 }}>
          <Panel title={`Below ${d.below}%`} sub="Worth a call home: the office's frequent-absentee list has the contact log" flush>
            <div className="table-wrap">
              <table className="data-table">
                <tbody>
                  {d.at_risk.map((x) => (
                    <tr key={x.student_id}>
                      <td>{x.student_name}</td>
                      <td className="num">{`${x.percent}%`}</td>
                      <td className="num">{`${x.absent_days} absent of ${x.marked_days}`}</td>
                    </tr>
                  ))}
                  {!d.at_risk.length ? (
                    <tr>
                      <td className="table-empty">Nobody below the mark.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Absent today" flush>
            <div className="table-wrap">
              <table className="data-table">
                <tbody>
                  {d.absent_today.map((x) => (
                    <tr key={x.student_id}>
                      <td>{x.full_name}</td>
                      <td className="muted">{x.remark ?? ""}</td>
                    </tr>
                  ))}
                  {!d.absent_today.length ? (
                    <tr>
                      <td className="table-empty">Nobody absent today, or the register isn&apos;t marked yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      ) : null}
      <Panel title={`${d?.register.section_label ?? "Register"} · ${MONTHS[m - 1]} ${y}`} flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="num">Roll</th>
                <th>Student</th>
                <th className="num">Present</th>
                <th className="num">Late</th>
                <th className="num">Half day</th>
                <th className="num">Absent</th>
                <th className="num">Days</th>
                <th className="num">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.student_id}>
                  <td className="num">{x.roll_no ?? ""}</td>
                  <td>{x.full_name}</td>
                  <td className="num">{x.present}</td>
                  <td className="num">{x.late || ""}</td>
                  <td className="num">{x.half_day || ""}</td>
                  <td className="num">{x.absent ? <strong className="bank-off">{x.absent}</strong> : ""}</td>
                  <td className="num">{x.marked_days}</td>
                  <td className="num">{x.marked_days ? <span className={x.attendance_pct < (d?.below ?? 75) ? "bank-off" : ""}>{`${x.attendance_pct}%`}</span> : "—"}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={8} className="table-empty">{r.loading ? "Loading…" : "No students in this section."}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
