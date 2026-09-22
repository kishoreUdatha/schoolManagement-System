"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { AcademicYear, SchoolClass } from "@/features/students/types";
import { ROLE_LABEL, type ClassSubject, type ObservationsPage, type Staff } from "./types";
import { todayIso } from "./util";

/** The form id the page-head button submits. */
export const OBSERVATION_FORM = "observation-form";

/**
 * SCR-090, live: POST /staff-ops/observations, with the teacher's earlier
 * observations (GET /staff-ops/observations?staff_id=) and share toggles.
 * There is no score field, so the mock's 1–5 ratings are not offered.
 */
export function ClassroomObservation() {
  const router = useRouter();
  const preset = useSearchParams().get("id") ?? "";
  const [staffId, setStaffId] = useState(preset);
  const [classId, setClassId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teachers = useApi<Staff[]>("/api/v1/school/staff", { role: "teacher" });
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const yearId = (years.data?.find((y) => y.is_current) ?? years.data?.[0])?.id ?? null;
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const subjects = useApi<ClassSubject[]>(classId ? `/api/v1/school/classes/${classId}/subjects` : null);
  const history = useApi<ObservationsPage>(staffId ? "/api/v1/school/staff-ops/observations" : null, { staff_id: staffId });

  useEffect(() => {
    if (preset) setStaffId(preset);
  }, [preset]);

  const teacher = teachers.data?.find((t) => String(t.id) === staffId);
  const sections = classes.data?.find((c) => c.id === classId)?.sections ?? [];

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    const num = (k: string) => (text(k) ? Number(text(k)) : null);
    // The API refuses an observation that records neither.
    if (!text("strengths") && !text("next_steps")) {
      setError("Write at least one strength or next step.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/v1/school/staff-ops/observations", {
        staff_id: Number(staffId),
        observed_on: text("observed_on"),
        section_id: num("section_id"),
        class_subject_id: num("class_subject_id"),
        focus: text("focus"),
        strengths: text("strengths"),
        next_steps: text("next_steps"),
        follow_up_on: text("follow_up_on"),
        shared_with_staff: f.get("shared_with_staff") === "on",
      });
      notify("Observation saved.");
      form.reset();
      setClassId(null);
      history.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function share(id: number, shared: boolean) {
    setError(null);
    try {
      await api.post(`/api/v1/school/staff-ops/observations/${id}/share`, { shared });
      notify(shared ? "Shared with the teacher." : "No longer shared.");
      history.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="two-col">
      <form id={OBSERVATION_FORM} className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? teachers.error ?? classes.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Details</h3>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>
                    Teacher
                    <span className="req">*</span>
                  </span>
                  <select name="staff_id" aria-label="Teacher" required value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                    <option value="">{teachers.loading ? "Loading teachers…" : "Select teacher"}</option>
                    {teachers.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Class</span>
                  <select aria-label="Class" value={classId ?? ""} onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Select class</option>
                    {classes.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Section</span>
                  <select name="section_id" aria-label="Section" disabled={!classId} defaultValue="" key={`s${classId}`}>
                    <option value="">Any section</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Subject</span>
                  <select name="class_subject_id" aria-label="Subject" disabled={!classId} defaultValue="" key={`c${classId}`}>
                    <option value="">Not specific</option>
                    {subjects.data?.map((cs) => (
                      <option key={cs.id} value={cs.id}>
                        {cs.subject.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>
                    Observation date
                    <span className="req">*</span>
                  </span>
                  <input type="date" name="observed_on" aria-label="Observation date" required defaultValue={todayIso()} />
                </label>
                <label className="field">
                  <span>Focus</span>
                  <input type="text" name="focus" maxLength={200} placeholder="e.g. Questioning, group work" />
                </label>
                {/* Not wired: lesson preparation, student engagement and subject knowledge scores — observations have no score fields. */}
                <label className="field full">
                  <span>Strengths</span>
                  <textarea name="strengths" maxLength={4000} placeholder="What went well" />
                </label>
                <label className="field full">
                  <span>Feedback</span>
                  <textarea name="next_steps" maxLength={4000} placeholder="What to try next" />
                </label>
                <label className="field">
                  <span>Next review</span>
                  <input type="date" name="follow_up_on" aria-label="Next review" />
                </label>
                <label className="field">
                  <span>Share with the teacher</span>
                  <input type="checkbox" name="shared_with_staff" aria-label="Share with the teacher" />
                </label>
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="button" className="btn" onClick={() => router.back()}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving || !staffId}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save observation"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>Staff</h3>
          <dl className="kv">
            <div>
              <dt>Designation</dt>
              <dd>{teacher ? (teacher.designation ?? ROLE_LABEL[teacher.role]) : "—"}</dd>
            </div>
            <div>
              <dt>Employee no.</dt>
              <dd>{teacher?.employee_no ?? "—"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{teacher ? (teacher.is_active ? "Active" : "Inactive") : "—"}</dd>
            </div>
            <div>
              <dt>Observations</dt>
              <dd>{history.data ? `${history.data.count} · ${history.data.follow_ups_due} follow-ups due` : "—"}</dd>
            </div>
          </dl>
          <div className="gap" />
          {!staffId ? (
            <p>Choose a teacher to see earlier observations.</p>
          ) : history.data?.observations.length ? (
            history.data.observations.map((o) => (
              <div className="timeline-item" key={o.id}>
                <span className="timeline-dot">
                  <Icon name="check" />
                </span>
                <div>
                  <h4>{o.focus ?? o.subject_name ?? "Observation"}</h4>
                  <p>{[date(o.observed_on), o.section_label, o.observer_name].filter(Boolean).join(" · ")}</p>
                  <button type="button" className="btn" style={{ marginTop: 6 }} onClick={() => share(o.id, !o.shared_with_staff)}>
                    {o.shared_with_staff ? "Stop sharing" : "Share with teacher"}
                  </button>
                </div>
                <Badge>{o.shared_with_staff ? "Shared" : "Draft"}</Badge>
              </div>
            ))
          ) : (
            <p>{history.loading ? "Loading…" : "No observations recorded for this teacher yet."}</p>
          )}
        </div>
      </aside>
    </div>
  );
}
