"use client";

import { useState } from "react";
import type { Row } from "@/components/ui/DataTable";
import { label, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { num, ReportView, share, today, useYear } from "./kit";

// ---------------------------------------------------------------- SCR-265

type Funnel = {
  by_status: Record<string, number>;
  total: number;
  in_progress: number;
  admitted: number;
  /** enquiry source ("direct": applied without an enquiry) through to confirmed */
  by_source: { source: string; enquiries: number; applications: number; confirmed: number; pending: number; conversion: number }[];
};

/** SCR-265, live: GET /api/v1/school/admissions/applications/funnel (?academic_year_id). */
export function AdmissionReport() {
  const y = useYear();
  const res = useApi<Funnel>(y.yearId ? "/api/v1/school/admissions/applications/funnel" : null, { academic_year_id: y.yearId });
  const d = res.data;
  const total = d?.total ?? 0;
  const stages = Object.entries(d?.by_status ?? {}).sort((a, b) => b[1] - a[1]);
  const closed = d ? Math.max(0, d.total - d.in_progress - d.admitted) : 0;
  const rows: Row[] = (d?.by_source ?? []).map((s) => [s.source === "direct" ? "Direct application" : label(s.source), num(s.enquiries), num(s.applications), num(s.confirmed), pct(s.conversion), num(s.pending)]);
  return (
    <ReportView
      filters={y.picker}
      error={y.error ?? res.error}
      loading={res.loading}
      stats={[
        { label: "Applications", value: num(d?.total), note: y.year ? `Academic year ${y.year.name}` : "Selected year" },
        { label: "In progress", value: num(d?.in_progress), note: "Still being processed" },
        { label: "Admitted", value: num(d?.admitted), note: "Became students" },
        { label: "Conversion", value: d ? pct(share(d.admitted, d.total)) : "—", note: "Admitted ÷ applications" },
      ]}
      chart={{ kind: "bars", title: "Applications by stage", sub: "Every stage an application is in now", bars: stages.map(([s, n]) => ({ label: label(s), value: n, text: num(n) })), empty: "No applications in this academic year yet." }}
      scope={[
        ["Academic year", y.year?.name ?? "—"],
        ["As of", today()],
        ["Group by", "Enquiry source"],
      ]}
      summary={
        total
          ? [
              { label: "Admitted", value: share(d!.admitted, total), text: pct(share(d!.admitted, total), 0) },
              { label: "In progress", value: share(d!.in_progress, total), text: pct(share(d!.in_progress, total), 0) },
              { label: "Closed", value: share(closed, total), text: pct(share(closed, total), 0) },
            ]
          : []
      }
      table={{
        name: "admission-funnel-by-source",
        sub: "Enquiries taken in the academic year and applications for it, by where the family heard of the school · conversion: confirmed ÷ enquiries",
        columns: ["Source", "Enquiries", "Applications", "Confirmed", "Conversion", "Pending"],
        rows,
        empty: "No enquiries or applications in this academic year yet.",
      }}
    />
  );
}

// ---------------------------------------------------------------- SCR-266

type Strength = {
  total_students: number;
  total_capacity: number;
  fill_percent: number;
  classes: { class_id: number; class_name: string; students: number; boys: number; girls: number; capacity: number; sections: number }[];
  sections: { section_id: number; class_name: string; section_name: string; students: number; boys: number; girls: number; capacity: number; fill_percent: number }[];
  history: { academic_year_id: number; academic_year_name: string; students: number }[];
};

/** SCR-266, live: GET /api/v1/school/analytics/strength (?academic_year_id). */
export function StrengthReport() {
  const y = useYear();
  const [by, setBy] = useState<"class" | "section">("class");
  const res = useApi<Strength>(y.yearId ? "/api/v1/school/analytics/strength" : null, { academic_year_id: y.yearId });
  const d = res.data;
  const columns = by === "class" ? ["Class", "Sections", "Boys", "Girls", "Total", "Capacity"] : ["Class", "Section", "Boys", "Girls", "Total", "Capacity", "Utilization"];
  const rows: Row[] =
    by === "class"
      ? (d?.classes ?? []).map((c) => [c.class_name, num(c.sections), num(c.boys), num(c.girls), num(c.students), num(c.capacity)])
      : (d?.sections ?? []).map((s) => [s.class_name, s.section_name, num(s.boys), num(s.girls), num(s.students), num(s.capacity), pct(s.fill_percent)]);
  const boys = d?.classes.reduce((n, c) => n + c.boys, 0) ?? 0;
  const girls = d?.classes.reduce((n, c) => n + c.girls, 0) ?? 0;
  const maxHist = Math.max(0, ...(d?.history.map((h) => h.students) ?? []), d?.total_students ?? 0);
  return (
    <ReportView
      filters={
        <>
          {y.picker}
          <select aria-label="Group by" value={by} onChange={(e) => setBy(e.target.value as "class" | "section")}>
            <option value="class">By class</option>
            <option value="section">By section</option>
          </select>
        </>
      }
      error={y.error ?? res.error}
      loading={res.loading}
      stats={[
        { label: "Students", value: num(d?.total_students), note: y.year ? `Academic year ${y.year.name}` : "Selected year" },
        { label: "Capacity", value: num(d?.total_capacity), note: "Seats across all sections" },
        { label: "Seats filled", value: d ? pct(d.fill_percent) : "—", note: "Students ÷ capacity" },
        { label: "Classes", value: num(d?.classes.length), note: `${num(d?.sections.length)} sections` },
      ]}
      chart={{ kind: "bars", title: "Students by class", sub: "Enrolled students in each class", bars: (d?.classes ?? []).map((c) => ({ label: c.class_name, value: c.students, text: num(c.students) })), empty: "No students in this academic year yet." }}
      scope={[
        ["Academic year", y.year?.name ?? "—"],
        ["Group by", by === "class" ? "Class" : "Class & section"],
        ["Boys / girls", d ? `${num(boys)} / ${num(girls)}` : "—"],
      ]}
      summaryTitle="Year on year"
      summary={[
        ...(d?.history ?? []).filter((h) => h.academic_year_id !== y.yearId).map((h) => ({ label: h.academic_year_name, value: share(h.students, maxHist), text: num(h.students) })),
        ...(d ? [{ label: y.year?.name ?? "This year", value: share(d.total_students, maxHist), text: num(d.total_students) }] : []),
      ]}
      table={{ name: "student-strength", columns, rows, empty: "No classes in this academic year yet." }}
    />
  );
}

// ---------------------------------------------------------------- SCR-267

type Demo = {
  total: number;
  gender: { label: string; count: number }[];
  blood_group: { label: string; count: number }[];
  age: { label: string; count: number }[];
  recorded: { dob: number; gender: number; blood_group: number };
};

/** SCR-267, live: GET /api/v1/school/analytics/demographics. */
export function DemographicsReport() {
  const res = useApi<Demo>("/api/v1/school/analytics/demographics");
  const d = res.data;
  const total = d?.total ?? 0;
  const group = (g: string, items: { label: string; count: number }[] | undefined, fmt: (l: string) => string): Row[] =>
    (items ?? []).map((x) => [fmt(x.label), g, num(x.count), pct(share(x.count, total))]);
  const rows: Row[] = [
    ...group("Gender", d?.gender, (l) => label(l)),
    ...group("Age", d?.age, (l) => (/^\d+$/.test(l) ? `${l} years` : l)),
    ...group("Blood group", d?.blood_group, (l) => l),
  ];
  const onFile = (n: number | undefined) => (d ? pct(share(n ?? 0, total)) : "—");
  return (
    <ReportView
      error={res.error}
      loading={res.loading}
      stats={[
        { label: "Students", value: num(d?.total), note: "Active students" },
        { label: "Gender on file", value: onFile(d?.recorded.gender), note: `${num(d?.recorded.gender)} records` },
        { label: "Date of birth on file", value: onFile(d?.recorded.dob), note: `${num(d?.recorded.dob)} records` },
        { label: "Blood group on file", value: onFile(d?.recorded.blood_group), note: `${num(d?.recorded.blood_group)} records` },
      ]}
      chart={{ kind: "bars", title: "Students by age", sub: "Age today, from date of birth", bars: (d?.age ?? []).map((a) => ({ label: /^\d+$/.test(a.label) ? `${a.label} years` : a.label, value: a.count, text: num(a.count) })), empty: "No dates of birth on file." }}
      scope={[
        ["Students", num(d?.total)],
        ["As of", today()],
        ["Group by", "Gender, age, blood group"],
      ]}
      summaryTitle="Gender"
      summary={(d?.gender ?? []).map((g) => ({ label: label(g.label), value: share(g.count, total), text: pct(share(g.count, total), 0) }))}
      table={{ name: "student-demographics", columns: ["Category", "Group", "Students", "Share"], rows, empty: "No students on file yet." }}
    />
  );
}
