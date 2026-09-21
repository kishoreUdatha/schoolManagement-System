"use client";

import Link from "next/link";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { label, pct } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Kv, StudentFrame } from "./StudentFrame";
import type { Academic, ExamHistory, StaffMember } from "./records";
import type { SchoolClass, StudentProfile } from "./types";

/**
 * SCR-059, live: GET /student-detail/{id}/academic (subjects and years),
 * /student-detail/{id}/exams (latest average), /classes + /staff (class teacher).
 */
export function StudentAcademic() {
  return <StudentFrame active={59}>{(s) => <Body s={s} />}</StudentFrame>;
}

function Body({ s }: { s: StudentProfile }) {
  const academic = useApi<Academic>(`/api/v1/school/student-detail/${s.id}/academic`);
  const exams = useApi<ExamHistory>(`/api/v1/school/student-detail/${s.id}/exams`);
  const classes = useApi<SchoolClass[]>("/api/v1/school/classes", { academic_year_id: s.academic_year_id });
  const staff = useApi<StaffMember[]>("/api/v1/school/staff");

  const section = classes.data?.find((c) => c.id === s.class_id)?.sections.find((x) => x.id === s.section_id);
  const teacher = section?.class_teacher_user_id ? staff.data?.find((m) => m.user_id === section.class_teacher_user_id)?.full_name : null;
  const latest = exams.data?.exams.find((e) => e.marked > 0);

  const subjects = academic.data?.subjects ?? [];
  const rows: Row[] = subjects.map((x) => [x.subject_name, x.teacher_name ?? "Not assigned", x.subject_code ?? "—", label(x.kind)]);
  const history = academic.data?.history ?? [];
  const historyRows: Row[] = history.map((h) => [h.academic_year_name ?? "—", h.class_name ?? "—", h.section_name ?? "—", h.roll_no ? String(h.roll_no) : "—", label(h.outcome)]);

  return (
    <div className="two-col">
      <div className="stack">
        <ErrorNote>{academic.error ?? exams.error}</ErrorNote>
        <Panel title={`${s.class_name ?? "No class"} ${s.section_name ?? ""} · Academic overview`}>
          <Kv
            rows={[
              ["Academic year", s.academic_year_name ?? "—"],
              ["Class", s.class_name ?? "—"],
              ["Section", s.section_name ?? "—"],
              ["Class teacher", section ? (teacher ?? (section.class_teacher_user_id ? "…" : "Not assigned")) : "—"],
              ["Roll no.", s.roll_no ? String(s.roll_no) : "—"],
              ["Subjects", academic.data ? String(subjects.length) : "…"],
              // Not wired: Board and Term — the school record has no board or term field.
            ]}
          />
        </Panel>
        <Panel title="Subjects this year" sub={s.academic_year_name ?? undefined} flush>
          <DataTable
            columns={["Subject", "Teacher", "Code", "Kind"]}
            rows={rows}
            selectable={false}
            rowAction={false}
            empty={academic.loading ? "Loading subjects…" : "No subjects have been set up for this class yet."}
          />
        </Panel>
        <Panel title="Year by year" flush>
          <DataTable
            columns={["Year", "Class", "Section", "Roll no.", "Outcome"]}
            rows={historyRows}
            selectable={false}
            rowAction={false}
            empty={academic.loading ? "Loading…" : "No enrolment history has been recorded yet."}
          />
        </Panel>
      </div>
      <aside>
        <Panel title="Academic average">
          <div className="donut">
            <div>
              {latest ? pct(latest.percent) : "—"}
              <small>{latest ? `${latest.exam_name} average` : exams.loading ? "Loading…" : "No marks recorded yet"}</small>
            </div>
          </div>
          <Link href={`${routeOf(61)}?id=${s.id}`} className="btn">
            View results
          </Link>
        </Panel>
      </aside>
    </div>
  );
}
