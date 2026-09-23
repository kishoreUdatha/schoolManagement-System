"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { AcademicYear, SchoolClass } from "@/features/students/types";
import type { OnlyStaff, Staff, WorkloadReport } from "./types";

const COLUMNS = ["Teacher", "Department", "Assigned classes", "Weekly periods", "Class teacher of", "Status"];

/**
 * SCR-084, live: who teaches what (GET /staff-ops/workload) and the class
 * teacher of every section (GET /classes, PATCH /sections/{id}). With `only`
 * (the staff profile's Allocation tab) the workspace shows just that person;
 * the class-teacher table still lists every section, as that is where they
 * are made class teacher of one.
 */
export function TeacherAllocation({ only }: { only?: OnlyStaff }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [status, setStatus] = useState("");
  const [yearId, setYearId] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workload = useApi<WorkloadReport>("/api/v1/school/staff-ops/workload");
  const teachers = useApi<Staff[]>("/api/v1/school/staff", { role: "teacher", status: "active" });
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });

  const q = typed.trim().toLowerCase();
  const list = useMemo(
    () =>
      (workload.data?.staff ?? [])
        .filter((s) => (only ? s.staff_id === only.staffId : s.role === "teacher"))
        .filter((s) => !status || (status === "active") === s.is_active)
        .filter((s) => !q || `${s.full_name} ${s.employee_no} ${s.department_name ?? ""}`.toLowerCase().includes(q)),
    [workload.data, status, q, only],
  );
  const rows: Row[] = list.map((s) => [
    { name: s.full_name, sub: s.employee_no },
    s.department_name ?? "—",
    Array.from(new Set(s.subjects.map((x) => x.class_name ?? "—"))).join(", ") || "—",
    String(s.periods_per_week),
    s.class_teacher_of.map((c) => c.label).join(", ") || "—",
    s.is_active ? "Active" : "Inactive",
  ]);

  const staffed = (workload.data?.staff ?? []).filter((s) => s.role === "teacher" && s.is_active);
  const sections = (classes.data ?? []).flatMap((c) => c.sections);
  const w = (v: number) => (workload.loading && !workload.data ? "…" : String(v));
  const c = (v: number) => (classes.loading && !classes.data ? "…" : !yearId ? "—" : String(v));
  const stats = [
    { label: "Teachers", value: w(staffed.length), note: "Active teaching staff" },
    { label: "No subjects", value: w(staffed.filter((s) => !s.subjects_taught).length), note: "Teachers with nothing assigned" },
    { label: "Sections", value: c(sections.length), note: "In the chosen year" },
    { label: "No class teacher", value: c(sections.filter((s) => !s.class_teacher_user_id).length), note: "Sections still to assign" },
  ];

  async function setClassTeacher(sectionId: number, userId: string) {
    setSaving(sectionId);
    setError(null);
    try {
      await api.patch(`/api/v1/school/sections/${sectionId}`, { class_teacher_user_id: userId ? Number(userId) : null });
      notify(userId ? "Class teacher assigned." : "Class teacher removed.");
      classes.reload();
      workload.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      {only ? null : <StatStrip items={years.data?.length === 0 ? stats.map((x) => ({ ...x, value: "—" })) : stats} compact />}
      <div className="filterbar">
        {only ? null : (
          <>
            <div className="searchbox">
              <Icon name="search" className="sm" />
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search teacher allocation…" aria-label="Search teachers" />
            </div>
            <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </>
        )}
        <select aria-label="Academic year" value={yearId ?? ""} onChange={(e) => setYearId(Number(e.target.value))}>
          {years.data?.map((y) => (
            <option key={y.id} value={y.id}>
              {`${y.name}${y.is_current ? " (current)" : ""}`}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{error ?? workload.error ?? classes.error ?? teachers.error}</ErrorNote>
      <Panel title="Allocation workspace" sub={workload.loading ? "Loading…" : "Subjects come from class subjects; periods from the timetable"} flush>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          selectable={false}
          rowAction={!only}
          onView={(i) => router.push(`${routeOf(82)}?id=${list[i].staff_id}`)}
          empty={workload.loading ? "Loading teachers…" : undefined}
          emptyState={{
            title: only ? "No workload for this teacher" : "No teachers yet",
            note: only
              ? `No subjects or periods are allocated to ${only.name} yet.`
              : "Add teaching staff, then assign them to classes and subjects.",
            action: only ? undefined : (
              <Link href="/staff/subject-class-assignment" className="btn primary">
                <Icon name="arrow" className="sm" />
                Assign subject teachers
              </Link>
            ),
          }}
        />
      </Panel>
      {only ? (
        <>
          <div className="gap" />
          <TeacherSubjects who={only} classes={classes.data ?? []} mine={list[0]?.subjects ?? []} onChange={() => workload.reload()} />
        </>
      ) : null}
      <div className="gap" />
      <Panel title="Class teachers" sub="Choose a class teacher for each section; changes save at once" flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Section</th>
                <th>Capacity</th>
                <th>Class teacher</th>
              </tr>
            </thead>
            <tbody>
              {classes.data?.flatMap((c) =>
                c.sections.map((s) => (
                  <tr key={s.id}>
                    <td>{c.name}</td>
                    <td>{s.name}</td>
                    <td>{s.capacity}</td>
                    <td>
                      <select
                        aria-label={`Class teacher for ${c.name} ${s.name}`}
                        value={s.class_teacher_user_id ?? ""}
                        disabled={saving === s.id}
                        onChange={(e) => setClassTeacher(s.id, e.target.value)}
                      >
                        <option value="">Not assigned</option>
                        {teachers.data?.map((t) => (
                          <option key={t.user_id} value={t.user_id}>
                            {t.full_name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={Boolean(classes.data?.some((c) => c.sections.length))}>
          {classes.loading ? "Loading sections…" : "No sections in this academic year."}
        </div>
      </Panel>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>Assignments follow the selected academic year. A whole class at once is set on Subjects & classes.</span>
      </div>
    </>
  );
}

/** One class's subjects, for the picker below. */
type ClassSubject = { id: number; teacher_user_id: number | null; subject: { id: number; name: string } };

/**
 * The subjects this teacher takes, from their side rather than the class's.
 * Same record underneath (PATCH /class-subjects/{id}), so Subjects & classes
 * shows the change at once; this is simply how a school thinks when it is
 * looking at one teacher: "what does she teach?"
 */
function TeacherSubjects({
  who,
  classes,
  mine,
  onChange,
}: {
  who: OnlyStaff;
  classes: SchoolClass[];
  mine: { class_subject_id: number; subject_name: string; class_name: string | null }[];
  onChange: () => void;
}) {
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subjects = useApi<ClassSubject[]>(classId ? `/api/v1/school/classes/${classId}/subjects` : null);

  // a subject already taken by somebody else says so rather than disappearing
  const options = subjects.data ?? [];
  const teacherNames = useApi<Staff[]>("/api/v1/school/staff", { role: "teacher" });
  const nameOf = (id: number | null) => teacherNames.data?.find((t) => t.user_id === id)?.full_name ?? "another teacher";

  async function save(classSubjectId: number, take: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/v1/school/class-subjects/${classSubjectId}`, { teacher_user_id: take ? who.userId : null });
      notify(take ? `${who.name} now teaches this subject.` : `Taken off ${who.name}.`);
      setSubjectId("");
      subjects.reload();
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Subjects this teacher takes" sub="The same assignment as Subjects & classes, from this teacher's side">
      <ErrorNote>{error}</ErrorNote>
      {mine.length ? (
        <div className="dept-list" style={{ marginBottom: 14 }}>
          {mine.map((s) => (
            <div className="dept-row" key={s.class_subject_id} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <span>{`${s.subject_name} · ${s.class_name ?? "—"}`}</span>
              <button type="button" className="btn text" disabled={busy} onClick={() => save(s.class_subject_id, false)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small" style={{ marginBottom: 14 }}>{`${who.name} does not teach any subject yet.`}</p>
      )}
      <div className="form-grid">
        <label className="field">
          <span>Class</span>
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSubjectId("");
            }}
          >
            <option value="">Choose a class…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Subject</span>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!classId || subjects.loading}>
            <option value="">{!classId ? "Choose a class first" : subjects.loading ? "Loading…" : options.length ? "Choose a subject…" : "This class has no subjects yet"}</option>
            {options
              .filter((o) => o.teacher_user_id !== who.userId)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {`${o.subject.name}${o.teacher_user_id ? ` (now ${nameOf(o.teacher_user_id)})` : ""}`}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="gap" />
      <button type="button" className="btn primary" disabled={!subjectId || busy} onClick={() => save(Number(subjectId), true)}>
        <Icon name="plus" className="sm" />
        {busy ? "Saving…" : "Give this subject to the teacher"}
      </button>
    </Panel>
  );
}
