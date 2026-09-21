"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Row } from "@/components/ui/DataTable";
import { date, label, pct } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { DateInput, monthStart, num, ReportView, share, today, useYear, type Bar } from "./kit";

type SchoolClass = { id: number; name: string };

// ---------------------------------------------------------------- SCR-268

type ClassSummary = {
  class_id: number;
  class_name: string;
  section_id: number;
  section_name: string;
  total_marks: number;
  present: number;
  absent: number;
  late: number;
  half_day: number;
  distinct_days: number;
  distinct_students: number;
  attendance_pct: number;
};

/** SCR-268, live: GET /api/v1/school/reports/attendance/class-summary (?from&to&class_id); classes of the current year for the filter. */
export function AttendanceAnalytics() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [classId, setClassId] = useState("");
  const y = useYear();
  const classes = useApi<SchoolClass[]>(y.yearId ? "/api/v1/school/classes" : null, { academic_year_id: y.yearId });
  const res = useApi<ClassSummary[]>(from && to ? "/api/v1/school/reports/attendance/class-summary" : null, { from, to, class_id: classId });
  const list = res.data ?? [];
  const sum = (k: "present" | "absent" | "late" | "half_day" | "total_marks") => list.reduce((n, r) => n + r[k], 0);
  const marks = sum("total_marks");
  // Present, late and half-day all count as attended, as the backend's percentage does.
  const attended = sum("present") + sum("late") + sum("half_day");
  const overall = marks ? share(attended, marks) : null;
  const rows: Row[] = list.map((r) => [`${r.class_name} ${r.section_name}`, num(r.distinct_students), num(r.present), num(r.absent), num(r.late), pct(r.attendance_pct)]);
  const bands: [string, (p: number) => boolean][] = [
    ["95% and above", (p) => p >= 95],
    ["85–95%", (p) => p >= 85 && p < 95],
    ["Below 85%", (p) => p < 85],
  ];
  return (
    <ReportView
      filters={
        <>
          <select aria-label="Filter by class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">All classes</option>
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <DateInput label="From" value={from} onChange={setFrom} />
          <DateInput label="To" value={to} onChange={setTo} />
        </>
      }
      error={res.error}
      loading={res.loading}
      stats={[
        { label: "Attendance", value: overall === null ? "—" : pct(overall), note: "Present, late and half-day" },
        { label: "Marks recorded", value: num(marks), note: `${date(from)} – ${date(to)}` },
        { label: "Absent marks", value: num(sum("absent")), note: marks ? `${pct(share(sum("absent"), marks))} of marks` : "In this period" },
        { label: "Sections reporting", value: num(list.length), note: "With attendance in the period" },
      ]}
      chart={{ kind: "bars", title: "Attendance by section", sub: "Share of marks attended in the period", percent: true, bars: list.map((r) => ({ label: `${r.class_name} ${r.section_name}`, value: r.attendance_pct, text: pct(r.attendance_pct, 0) })), empty: "No attendance was marked in this period." }}
      scope={[
        ["Date range", `${date(from)} – ${date(to)}`],
        ["Classes", classId ? (classes.data?.find((c) => String(c.id) === classId)?.name ?? "—") : "All classes"],
        ["Group by", "Class & section"],
      ]}
      summary={bands.map(([l, f]) => {
        const n = list.filter((r) => f(r.attendance_pct)).length;
        return { label: l, value: share(n, list.length), text: `${n}` };
      })}
      table={{ name: "attendance-by-section", columns: ["Class", "Students", "Present", "Absent", "Late", "Attendance"], rows, empty: "No attendance was marked in this period." }}
    />
  );
}

// ---------------------------------------------------------------- SCR-269

type Chronic = {
  from_date: string;
  to_date: string;
  below: number;
  min_days: number;
  count: number;
  students: { student_id: number; admission_no: string; student_name: string; section_label: string | null; marked_days: number; present_days: number; absent_days: number; percent: number }[];
};

/** SCR-269, live: GET /api/v1/school/analytics/chronic-absence (?below&min_days&from&to). */
export function ChronicAbsence() {
  const router = useRouter();
  const [below, setBelow] = useState("75");
  const [minDays, setMinDays] = useState("10");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const res = useApi<Chronic>("/api/v1/school/analytics/chronic-absence", { below, min_days: minDays, from, to });
  const d = res.data;
  const kids = d?.students ?? [];
  const bySection = new Map<string, number>();
  kids.forEach((k) => bySection.set(k.section_label ?? "No section", (bySection.get(k.section_label ?? "No section") ?? 0) + 1));
  const b = Number(below);
  const bands: [string, (p: number) => boolean][] = [
    ["Below 50%", (p) => p < 50],
    [`50–${b}%`, (p) => p >= 50],
  ];
  const rows: Row[] = kids.map((k) => [{ name: k.student_name, sub: k.admission_no }, k.section_label ?? "—", num(k.marked_days), num(k.present_days), num(k.absent_days), pct(k.percent)]);
  return (
    <ReportView
      filters={
        <>
          <select aria-label="Attendance below" value={below} onChange={(e) => setBelow(e.target.value)}>
            {["60", "70", "75", "80", "85", "90"].map((v) => (
              <option key={v} value={v}>{`Below ${v}%`}</option>
            ))}
          </select>
          <select aria-label="Minimum days marked" value={minDays} onChange={(e) => setMinDays(e.target.value)}>
            {["1", "5", "10", "20", "30"].map((v) => (
              <option key={v} value={v}>{`At least ${v} days marked`}</option>
            ))}
          </select>
          <DateInput label="From" value={from} onChange={setFrom} />
          <DateInput label="To" value={to} onChange={setTo} />
        </>
      }
      error={res.error}
      loading={res.loading}
      stats={[
        { label: "Students below threshold", value: num(d?.count), note: "School-wide" },
        { label: "Threshold", value: d ? pct(d.below, 0) : "—", note: "Attendance below this" },
        { label: "Minimum days", value: num(d?.min_days), note: "Days marked to count" },
        { label: "Window", value: d ? `${date(d.from_date).slice(0, 6)} – ${date(d.to_date).slice(0, 6)}` : "—", note: d ? `${date(d.from_date)} – ${date(d.to_date)}` : "Attendance period" },
      ]}
      chart={{ kind: "bars", title: "Students below threshold by section", sub: "Count of children under the line", bars: [...bySection].map(([l, n]) => ({ label: l, value: n, text: num(n) })), empty: "No child is below the threshold. Good news." }}
      scope={[
        ["Date range", d ? `${date(d.from_date)} – ${date(d.to_date)}` : "—"],
        ["Attendance below", d ? pct(d.below, 0) : "—"],
        ["Days marked at least", num(d?.min_days)],
        ["Group by", "Student"],
      ]}
      summaryTitle="How far below"
      summary={kids.length ? bands.map(([l, f]) => { const n = kids.filter((k) => f(k.percent)).length; return { label: l, value: share(n, kids.length), text: `${n}` }; }) : []}
      // Not wired: "Last follow-up" — the API does not record follow-ups on absence.
      table={{
        name: "chronic-absence",
        columns: ["Student", "Class", "Days marked", "Present days", "Absent days", "Attendance"],
        rows,
        empty: "No child is below the threshold for this window.",
        onView: (i) => router.push(`${routeOf(57)}?id=${kids[i].student_id}`),
      }}
    />
  );
}

// ---------------------------------------------------------------- SCR-276

type StaffAtt = {
  year: number;
  month: number;
  from_date: string;
  to_date: string;
  working_days: number;
  staff: { user_id: number; name: string; role: string; present: number; late: number; absent: number; on_leave: number; sick: number; holiday: number; marked: number; percent: number }[];
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** SCR-276, live: GET /api/v1/school/analytics/staff-attendance (?year&month). */
export function StaffAttendanceReport() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [by, setBy] = useState<"person" | "role">("person");
  const res = useApi<StaffAtt>("/api/v1/school/analytics/staff-attendance", { year, month });
  const d = res.data;
  const staff = d?.staff ?? [];
  const avg = staff.length ? staff.reduce((n, s) => n + s.percent, 0) / staff.length : null;
  const leave = staff.reduce((n, s) => n + s.on_leave + s.sick, 0);
  const roles = new Map<string, { n: number; present: number; late: number; absent: number; leave: number; pctSum: number }>();
  staff.forEach((s) => {
    const r = roles.get(s.role) ?? { n: 0, present: 0, late: 0, absent: 0, leave: 0, pctSum: 0 };
    roles.set(s.role, { n: r.n + 1, present: r.present + s.present, late: r.late + s.late, absent: r.absent + s.absent, leave: r.leave + s.on_leave + s.sick, pctSum: r.pctSum + s.percent });
  });
  const columns = by === "person" ? ["Staff member", "Present", "Late", "Absent", "Leave", "Attendance"] : ["Role", "Staff", "Present", "Late", "Absent", "Leave", "Attendance"];
  const rows: Row[] =
    by === "person"
      ? staff.map((s) => [{ name: s.name, sub: label(s.role) }, num(s.present), num(s.late), num(s.absent), num(s.on_leave + s.sick), pct(s.percent)])
      : [...roles].map(([r, v]) => [label(r), num(v.n), num(v.present), num(v.late), num(v.absent), num(v.leave), pct(v.pctSum / v.n)]);
  const bars: Bar[] = [...roles].map(([r, v]) => ({ label: label(r), value: v.pctSum / v.n, text: pct(v.pctSum / v.n, 0) }));
  const years = [now.getFullYear() - 1, now.getFullYear()];
  return (
    <ReportView
      filters={
        <>
          <select aria-label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select aria-label="Group by" value={by} onChange={(e) => setBy(e.target.value as "person" | "role")}>
            <option value="person">By person</option>
            <option value="role">By role</option>
          </select>
        </>
      }
      error={res.error}
      loading={res.loading}
      stats={[
        { label: "Staff", value: num(staff.length), note: "With attendance this month" },
        { label: "Working days", value: num(d?.working_days), note: "Holidays excluded" },
        { label: "Average attendance", value: avg === null ? "—" : pct(avg), note: "Across staff" },
        { label: "Leave days", value: num(leave), note: "On leave or sick" },
      ]}
      chart={{ kind: "bars", title: "Attendance by role", sub: `${MONTHS[month - 1]} ${year} · average per person`, percent: true, bars, empty: "No staff attendance was marked this month." }}
      scope={[
        ["Month", `${MONTHS[month - 1]} ${year}`],
        ["Date range", d ? `${date(d.from_date)} – ${date(d.to_date)}` : "—"],
        ["Group by", by === "person" ? "Person" : "Role"],
      ]}
      summary={
        staff.length
          ? [
              { label: "95% and above", value: share(staff.filter((s) => s.percent >= 95).length, staff.length), text: `${staff.filter((s) => s.percent >= 95).length}` },
              { label: "85–95%", value: share(staff.filter((s) => s.percent >= 85 && s.percent < 95).length, staff.length), text: `${staff.filter((s) => s.percent >= 85 && s.percent < 95).length}` },
              { label: "Below 85%", value: share(staff.filter((s) => s.percent < 85).length, staff.length), text: `${staff.filter((s) => s.percent < 85).length}` },
            ]
          : []
      }
      table={{ name: "staff-attendance", columns, rows, empty: "No staff attendance was marked this month." }}
    />
  );
}
