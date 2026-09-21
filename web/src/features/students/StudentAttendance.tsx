"use client";

import { useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date, label, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { StudentFrame, dayName, monthName } from "./StudentFrame";
import type { AttendanceReport } from "./records";
import type { StudentProfile } from "./types";

/** SCR-060, live: GET /reports/attendance/students/{id} (months and days). */
export function StudentAttendance() {
  return <StudentFrame active={60}>{(s) => <Body s={s} />}</StudentFrame>;
}

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

function Body({ s }: { s: StudentProfile }) {
  const report = useApi<AttendanceReport>(`/api/v1/school/reports/attendance/students/${s.id}`);
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState("");
  const r = report.data;

  // Open on the latest month that has marks.
  useEffect(() => {
    if (!month && r?.months.length) setMonth(r.months[r.months.length - 1].month);
  }, [r, month]);

  const m = r?.months.find((x) => x.month === month);
  const scope = m ?? r;
  const note = m ? monthName(m.month) : "All marked days";
  const marked = scope ? scope.present + scope.absent + scope.late + scope.half_day : 0;
  const stats = [
    { label: "Present", value: scope ? days(scope.present) : "…", note },
    { label: "Absent", value: scope ? days(scope.absent) : "…", note },
    { label: "Late", value: scope ? days(scope.late) : "…", note: "Counted as present" },
    { label: "Attendance", value: scope ? pct(scope.percent) : "…", note: scope ? `${scope.present + scope.late} / ${marked} marked days` : "Marked days" },
  ];

  const list = (r?.days ?? []).filter((d) => (!month || d.date.startsWith(month)) && (!status || d.status === status));
  const rows: Row[] = list.map((d) => [date(d.date), dayName(d.date), label(d.status), d.remark ?? "—"]);

  return (
    <>
      <div className="filterbar">
        <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">All months</option>
          {r?.months.map((x) => (
            <option key={x.month} value={x.month}>
              {monthName(x.month)}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="present">Present</option>
          <option value="absent">Absent</option>
          <option value="late">Late</option>
          <option value="half_day">Half day</option>
        </select>
      </div>
      <ErrorNote>{report.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <Panel title="Daily history" sub={`${m ? monthName(m.month) : "All months"}${r?.section_label ? ` · ${r.section_label}` : ""}`} flush>
        {/* Not wired: Session, Check-in and Check-out — the register records a status per day, not times. */}
        <DataTable
          columns={["Date", "Day", "Status", "Remark"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          empty={report.loading ? "Loading attendance…" : "No attendance has been marked for this period."}
        />
      </Panel>
    </>
  );
}
