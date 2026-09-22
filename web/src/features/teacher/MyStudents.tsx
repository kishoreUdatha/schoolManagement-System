"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { date, initials, label, money, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { KV, Note } from "@/features/self/kit";
import type { MyClasses, RosterStudent, StudentProfile } from "./types";

type SectionOption = { id: number; label: string; roles: string[]; count: number; current: boolean };

/** Every section the teacher is in, as class teacher or subject teacher, with what they teach there. */
function sectionsOf(c: MyClasses | null): SectionOption[] {
  const m = new Map<number, SectionOption>();
  for (const s of c?.class_teacher_of ?? []) {
    m.set(s.section_id, { id: s.section_id, label: s.section_label, roles: ["Class teacher"], count: s.student_count, current: s.is_current_year });
  }
  for (const cs of c?.subject_teacher_of ?? []) {
    for (const s of cs.sections) {
      const o = m.get(s.section_id) ?? { id: s.section_id, label: `${cs.class_name} ${s.section_name}`, roles: [], count: s.student_count, current: cs.is_current_year };
      if (!o.roles.includes(cs.subject_name)) o.roles.push(cs.subject_name);
      m.set(s.section_id, o);
    }
  }
  return [...m.values()].sort((a, b) => Number(b.current) - Number(a.current) || a.label.localeCompare(b.label));
}

/**
 * NEW-096, live: GET /teacher/my-classes for the sections the teacher is in,
 * GET /teacher/sections/{id}/students for a section's roster, and
 * GET /teacher/students/{id} (?id=) for one student's profile with
 * attendance, behaviour, exams, homework and parents.
 */
export function MyStudents() {
  const params = useSearchParams();
  const id = params.get("id");
  return id ? <StudentDetail id={id} /> : <Roster />;
}

function Roster() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const classes = useApi<MyClasses>("/api/v1/teacher/my-classes");
  const sections = useMemo(() => sectionsOf(classes.data), [classes.data]);
  const wanted = Number(params.get("section")) || null;
  const [sectionId, setSectionId] = useState<number | null>(wanted);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (sectionId === null && sections.length) setSectionId(sections[0].id);
  }, [sections, sectionId]);

  const roster = useApi<RosterStudent[]>(sectionId ? `/api/v1/teacher/sections/${sectionId}/students` : null);
  const all = useMemo(() => roster.data ?? [], [roster.data]);
  const q = search.trim().toLowerCase();
  const items = all.filter((s) => !q || `${s.full_name} ${s.admission_no}`.toLowerCase().includes(q));
  const section = sections.find((s) => s.id === sectionId);
  const c = classes.data;
  const ready = c !== null;
  const stats = [
    { label: "Sections", value: ready ? String(sections.length) : "…", note: "You teach or class-teach" },
    { label: "Students", value: ready ? String(sections.reduce((n, s) => n + s.count, 0)) : "…", note: "Across those sections" },
    { label: "Class teacher of", value: ready ? String(c.class_teacher_of.length) : "…", note: ready ? c.class_teacher_of.map((s) => s.section_label).join(", ") || "No class of your own" : "Loading" },
    { label: "Subjects", value: ready ? String(new Set(c.subject_teacher_of.map((s) => s.subject_id)).size) : "…", note: ready ? [...new Set(c.subject_teacher_of.map((s) => s.subject_name))].join(", ") || "None assigned" : "Loading" },
  ];

  const rows: Row[] = items.map((s) => [{ name: s.full_name, sub: s.admission_no }, String(s.roll_no), label(s.gender), date(s.dob)]);
  const open = (sid: number) => router.push(`${path}?id=${sid}${sectionId ? `&section=${sectionId}` : ""}`);

  if (c && !sections.length) return <Note>You are not assigned to any class yet. The school office assigns class teachers and subject teachers.</Note>;

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or admission no…" aria-label="Search students" />
        </div>
        <select aria-label="Section" value={sectionId ?? ""} onChange={(e) => setSectionId(Number(e.target.value))}>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {`${s.label} · ${s.roles.join(", ")}${s.current ? "" : " (past year)"}`}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{classes.error ?? roster.error}</ErrorNote>
      <Panel title={section ? section.label : "Students"} sub={`${section ? section.roles.join(", ") : "Your class"}${roster.loading ? " · Loading…" : ` · ${all.length} active student(s)`}`} flush>
        <DataTable
          columns={["Student", "Roll no", "Gender", "Date of birth"]}
          rows={rows}
          selectable={false}
          onView={(i) => open(items[i].id)}
          empty={roster.loading || classes.loading ? "Loading…" : all.length ? "No student matches the search." : "No active students in this section."}
        />
      </Panel>
    </>
  );
}

function StudentDetail({ id }: { id: string }) {
  const params = useSearchParams();
  const path = usePathname();
  const section = params.get("section");
  const back = section ? `${path}?section=${section}` : path;
  const res = useApi<StudentProfile>(`/api/v1/teacher/students/${id}`);
  const s = res.data;

  if (res.error)
    return (
      <>
        <ErrorNote>{res.error}</ErrorNote>
        <Link href={back} className="btn">
          <Icon name="arrow" className="sm" />
          Back to my students
        </Link>
      </>
    );
  if (!s) return <Loading what="Loading the student…" />;

  const a = s.attendance;
  const cls = [s.class_name, s.section_name].filter(Boolean).join(" ");

  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        <Link href={back} className="btn">
          <Icon name="arrow" className="sm" />
          Back to my students
        </Link>
      </div>
      <section className="panel profile-banner">
        <div className="profile-hero">
          <div className="row">
            <span className="avatar mint large">{initials(s.full_name)}</span>
            <div>
              <h2>{s.full_name}</h2>
              <p>{`${cls || "No class"} · Admission no. ${s.admission_no}`}</p>
              <div className="profile-meta">
                <span>
                  <Icon name="calendar" className="sm" />
                  {` ${s.academic_year_name ?? "—"}`}
                </span>
                <span>
                  <Icon name="users" className="sm" />
                  {` Roll no. ${s.roll_no}`}
                </span>
                <Badge>{s.is_active ? "Active" : "Inactive"}</Badge>
              </div>
            </div>
          </div>
          <div className="profile-badge">
            <strong>{pct(a.attendance_percent)}</strong>
            <small>{`Attendance · ${a.days_marked} days marked`}</small>
          </div>
        </div>
      </section>
      <div className="gap" />
      <div className="two-col">
        <div className="stack">
          <Panel title="Student details">
            <KV
              rows={[
                ["Date of birth", date(s.dob)],
                ["Gender", label(s.gender)],
                ["Blood group", s.blood_group ?? "—"],
                ["Address", s.address ?? "—"],
              ]}
            />
          </Panel>
          <Panel title="Parents & guardians">
            {s.parents.length ? (
              s.parents.map((p, i) => (
                <div className="spread" key={p.user_id} style={{ padding: "8px 0", borderTop: i ? "1px solid var(--line)" : undefined }}>
                  <div className="person">
                    <span className={`avatar ${["mint", "", "peach", "lilac"][i % 4]}`}>{initials(p.full_name)}</span>
                    <div>
                      {p.full_name}
                      <small>{label(p.relation)}</small>
                    </div>
                  </div>
                  <span className="small muted">{[p.phone, p.email].filter(Boolean).join(" · ") || "No contact recorded"}</span>
                </div>
              ))
            ) : (
              <p className="muted">No parent or guardian is linked yet.</p>
            )}
          </Panel>
          <Panel title="Exam results" sub="Published results" flush>
            <DataTable
              columns={["Exam", "Kind", "Percentage", "Grade", "Result"]}
              rows={s.exams.map((e) => [e.exam_name, label(e.exam_kind), pct(e.percentage), e.overall_grade, e.is_pass ? "Pass" : "Failed"])}
              selectable={false}
              rowAction={false}
              empty="No published results yet."
            />
          </Panel>
          <Panel title="Behaviour" sub="Recent ratings, 1 to 5" flush>
            <DataTable
              columns={["Period", "Punctuality", "Participation", "Discipline", "Respect", "Average", "Observation"]}
              rows={s.behaviour_recent.map((b) => [b.period_key, String(b.punctuality), String(b.participation), String(b.discipline), String(b.respect), b.average.toFixed(1), b.teacher_note ?? "—"])}
              selectable={false}
              rowAction={false}
              empty="No behaviour ratings yet."
            />
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Attendance">
            <div className="progress-stack">
              <div>
                <div className="progress-label">
                  <span>Attendance</span>
                  <strong>{pct(a.attendance_percent)}</strong>
                </div>
                <div className="bar-track">
                  <i style={{ width: `${a.attendance_percent ?? 0}%` }} />
                </div>
              </div>
              <div className="progress-label">
                <span>Present / absent</span>
                <strong>{`${a.days_present} / ${a.days_absent}`}</strong>
              </div>
              <div className="progress-label">
                <span>Late / half day</span>
                <strong>{`${a.days_late} / ${a.days_half_day}`}</strong>
              </div>
              <div className="progress-label">
                <span>Days marked</span>
                <strong>{a.days_marked}</strong>
              </div>
              <div className="progress-label">
                <span>Fees pending</span>
                <strong>{money(s.fees_pending_amount)}</strong>
              </div>
            </div>
          </Panel>
          <Panel title="Recent homework">
            {s.homework_recent.length ? (
              s.homework_recent.map((h) => (
                <div className="timeline-item" key={h.id}>
                  <span className="timeline-dot">
                    <Icon name="file" />
                  </span>
                  <div>
                    <h4>{h.title}</h4>
                    <p>{`${h.subject_name ?? "—"} · due ${date(h.due_date)}${h.is_past_due ? " · past due" : ""}`}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No homework set recently.</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
