"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { AcademicYear, SchoolClass } from "@/features/students/types";
import type { ClassSubject, Staff, Subject } from "./types";

import { ask } from "@/lib/dialog";
/**
 * SCR-085, live: the subjects a class takes and who teaches each
 * (GET /classes/{id}/subjects; POST to add a subject, PATCH
 * /class-subjects/{id} for the teacher, periods a week, usual room and
 * optional flag, DELETE to remove). Rooms come from GET /rooms.
 */
export function SubjectAssignment() {
  const [yearId, setYearId] = useState<number | null>(null);
  const [classId, setClassId] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  useEffect(() => {
    if (classes.data && !classes.data.some((c) => c.id === classId)) setClassId(classes.data[0]?.id ?? null);
  }, [classes.data, classId]);

  const current = useApi<ClassSubject[]>(classId ? `/api/v1/school/classes/${classId}/subjects` : null);
  const subjects = useApi<Subject[]>("/api/v1/school/subjects", { active_only: true });
  const teachers = useApi<Staff[]>("/api/v1/school/staff", { role: "teacher", status: "active" });
  const rooms = useApi<{ id: number; name: string; code: string; is_active: boolean }[]>("/api/v1/school/rooms");

  const klass = classes.data?.find((c) => c.id === classId);
  const q = typed.trim().toLowerCase();
  const rows = useMemo(() => (current.data ?? []).filter((cs) => !q || `${cs.subject.name} ${cs.subject.code ?? ""}`.toLowerCase().includes(q)), [current.data, q]);
  const addable = (subjects.data ?? []).filter((s) => !current.data?.some((cs) => cs.subject_id === s.id));
  const teacherName = (uid: number | null) => teachers.data?.find((t) => t.user_id === uid)?.full_name;

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      notify(done);
      current.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const addSubject = () =>
    adding &&
    run(async () => {
      await api.post(`/api/v1/school/classes/${classId}/subjects`, { subject_id: Number(adding) });
      setAdding("");
    }, "Subject added to the class.");

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search subjects in this class…" aria-label="Search subjects" />
        </div>
        <select aria-label="Class" value={classId ?? ""} onChange={(e) => setClassId(Number(e.target.value))}>
          {classes.data?.length ? null : <option value="">No classes</option>}
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Academic year" value={yearId ?? ""} onChange={(e) => setYearId(Number(e.target.value))}>
          {years.data?.map((y) => (
            <option key={y.id} value={y.id}>
              {`${y.name}${y.is_current ? " (current)" : ""}`}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{error ?? classes.error ?? current.error ?? teachers.error}</ErrorNote>
      <Panel
        title="Allocation workspace"
        sub={klass ? `${klass.name} · ${rows.length} subjects · changes save at once` : "Choose a class"}
        action={
          <div className="row">
            <select aria-label="Subject to add" value={adding} onChange={(e) => setAdding(e.target.value)} disabled={!classId || busy}>
              <option value="">Add a subject…</option>
              {addable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn" disabled={!adding || busy} onClick={addSubject}>
              <Icon name="plus" className="sm" />
              Add
            </button>
          </div>
        }
        flush
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Section</th>
                <th>Subject</th>
                <th>Teacher</th>
                <th>Periods per week</th>
                <th>Room</th>
                <th>Type</th>
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((cs) => (
                <tr key={cs.id}>
                  <td>{klass?.name ?? "—"}</td>
                  <td>{klass?.sections.map((s) => s.name).join(", ") || "—"}</td>
                  <td>{cs.subject.code ? `${cs.subject.name} (${cs.subject.code})` : cs.subject.name}</td>
                  <td>
                    <select
                      aria-label={`Teacher for ${cs.subject.name}`}
                      value={cs.teacher_user_id ?? ""}
                      disabled={busy}
                      onChange={(e) =>
                        run(
                          () => api.patch(`/api/v1/school/class-subjects/${cs.id}`, { teacher_user_id: e.target.value ? Number(e.target.value) : null }),
                          e.target.value ? `${teacherName(Number(e.target.value)) ?? "Teacher"} assigned.` : "Teacher removed.",
                        )
                      }
                    >
                      <option value="">Not assigned</option>
                      {teachers.data?.map((t) => (
                        <option key={t.user_id} value={t.user_id}>
                          {t.full_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      style={{ width: 72 }}
                      aria-label={`Periods a week for ${cs.subject.name}`}
                      title="Periods a week in each section; 0 means not set"
                      key={`p${cs.id}-${cs.periods_per_week ?? 0}`}
                      defaultValue={cs.periods_per_week ?? 0}
                      disabled={busy}
                      onBlur={(e) => {
                        const v = Math.max(0, Math.min(40, Math.round(Number(e.target.value) || 0)));
                        if (v !== (cs.periods_per_week ?? 0)) run(() => api.patch(`/api/v1/school/class-subjects/${cs.id}`, { periods_per_week: v }), `${cs.subject.name}: ${v} periods a week.`);
                      }}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Room for ${cs.subject.name}`}
                      value={cs.room_id ?? ""}
                      disabled={busy}
                      onChange={(e) =>
                        run(
                          () => api.patch(`/api/v1/school/class-subjects/${cs.id}`, { room_id: e.target.value ? Number(e.target.value) : null }),
                          e.target.value ? "Room set." : "Room cleared.",
                        )
                      }
                    >
                      <option value="">{rooms.data?.length ? "Class's own room" : "No rooms set up"}</option>
                      {rooms.data
                        ?.filter((r) => r.is_active || r.id === cs.room_id)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      title="Switch between core and optional"
                      onClick={() => run(() => api.patch(`/api/v1/school/class-subjects/${cs.id}`, { is_optional: !cs.is_optional }), "Subject updated.")}
                    >
                      <Badge>{cs.is_optional ? "Optional" : "Core"}</Badge>
                    </button>
                  </td>
                  <td className="right">
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={async () => (await ask(`Remove ${cs.subject.name} from ${klass?.name ?? "this class"}?`)) && run(() => api.delete(`/api/v1/school/class-subjects/${cs.id}`), "Subject removed.")}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={rows.length > 0}>
          {current.loading ? "Loading subjects…" : q ? "No subjects match." : "This class has no subjects yet. Add one above."}
        </div>
      </Panel>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>Subjects are set for the whole class, so every section shares them, their teacher, their periods a week (the timetable generator aims for this in each section) and their usual room.</span>
      </div>
    </>
  );
}
