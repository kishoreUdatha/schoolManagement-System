"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { AcademicYear, SchoolClass, StudentProfile } from "./types";

const RELATIONS = ["father", "mother", "guardian", "grandparent", "uncle", "aunt", "sibling", "other"];

/**
 * SCR-056 Add Student (POST /students, then POST /students/{id}/guardians
 * when a parent is given) and SCR-058 Edit Student (PATCH /students/{id}).
 * Same form; edit mode takes ?id= and leaves parents to Siblings & Family.
 */
export function StudentForm({ mode }: { mode: "add" | "edit" }) {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const editing = mode === "edit";

  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const existing = useApi<StudentProfile>(editing && id ? `/api/v1/school/students/${id}` : null);
  const [yearId, setYearId] = useState<number | null>(null);
  const [classId, setClassId] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing && existing.data) {
      setYearId(existing.data.academic_year_id);
      setClassId(existing.data.class_id);
      setSectionId(existing.data.section_id);
    } else if (!editing && yearId === null && years.data?.length) {
      setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
    }
  }, [editing, existing.data, years.data, yearId]);

  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const sections = useMemo(() => classes.data?.find((c) => c.id === classId)?.sections ?? [], [classes.data, classId]);

  if (editing && !id) return <PickFirst what="student to edit" href={routeOf(55)} cta="Open the student directory" />;
  if (editing && existing.loading && !existing.data) return <Loading what="Loading the student…" />;
  const s = existing.data;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => (String(f.get(k) ?? "").trim() || null);
    if (!sectionId) {
      setError("Choose a class and section.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const common = {
        full_name: text("full_name"),
        dob: text("dob"),
        gender: text("gender"),
        blood_group: text("blood_group"),
        address: text("address"),
        section_id: sectionId,
        roll_no: text("roll_no") ? Number(text("roll_no")) : null,
      };
      if (editing) {
        await api.patch(`/api/v1/school/students/${id}`, common);
        notify("Student updated.");
        router.push(`${routeOf(57)}?id=${id}`);
        return;
      }
      const created = await api.post<{ id: number }>("/api/v1/school/students", {
        ...common,
        academic_year_id: yearId,
        admission_no: text("admission_no"),
      });
      if (text("parent_name")) {
        try {
          await api.post(`/api/v1/school/students/${created.id}/guardians`, {
            full_name: text("parent_name"),
            phone: text("parent_phone"),
            email: text("parent_email"),
            relation: text("relation") ?? "guardian",
            is_primary: true,
            can_pickup: true,
            is_emergency_contact: true,
            lives_with_student: true,
          });
        } catch (err) {
          // The student exists; say what did not save rather than losing both.
          notify(`Student created, but the parent was not saved: ${errorText(err)}`);
          router.push(`${routeOf(57)}?id=${created.id}`);
          return;
        }
      }
      notify("Student created.");
      router.push(`${routeOf(57)}?id=${created.id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const field = (labelText: string, control: JSX.Element, required = false, full = false) => (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {labelText}
        {required ? <span className="req">*</span> : null}
      </span>
      {control}
    </label>
  );

  return (
    <div>
      <form id="student-form" className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? years.error ?? existing.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Student information</h3>
              </div>
              <div className="form-grid">
                {field("Student name", <input name="full_name" required minLength={2} defaultValue={s?.full_name} placeholder="Enter student name" />, true)}
                {editing
                  ? field("Admission no.", <input value={s?.admission_no ?? ""} readOnly />)
                  : field("Admission no.", <input name="admission_no" placeholder="Leave blank to number automatically" />)}
                {field("Date of birth", <input type="date" name="dob" defaultValue={s?.dob ?? ""} />)}
                {field(
                  "Gender",
                  <select name="gender" defaultValue={s?.gender ?? ""}>
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>,
                )}
                {field(
                  "Class",
                  <select
                    value={classId ?? ""}
                    required
                    onChange={(e) => {
                      setClassId(e.target.value ? Number(e.target.value) : null);
                      setSectionId(null);
                    }}
                  >
                    <option value="">{classes.loading ? "Loading classes…" : "Select class"}</option>
                    {classes.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>,
                  true,
                )}
                {field(
                  "Section",
                  <select value={sectionId ?? ""} required onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)} disabled={!classId}>
                    <option value="">Select section</option>
                    {sections.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>,
                  true,
                )}
              </div>
            </section>
            <section>
              <div className="form-section-title">
                <span className="number">02</span>
                <h3>{editing ? "Academic & additional information" : "Contact & additional information"}</h3>
              </div>
              <div className="form-grid">
                {field(
                  "Academic year",
                  <select value={yearId ?? ""} disabled={editing} onChange={(e) => setYearId(Number(e.target.value))}>
                    {years.data?.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </select>,
                )}
                {field("Roll no.", <input type="number" min={1} name="roll_no" defaultValue={s?.roll_no ?? ""} placeholder="Enter roll no." />)}
                {field("Blood group", <input name="blood_group" maxLength={10} defaultValue={s?.blood_group ?? ""} placeholder="e.g. B+" />)}
                {!editing ? (
                  <>
                    {field("Parent name", <input name="parent_name" minLength={2} placeholder="Enter parent name" />)}
                    {field(
                      "Relationship",
                      <select name="relation" defaultValue="father">
                        {RELATIONS.map((r) => (
                          <option key={r} value={r}>
                            {r[0].toUpperCase() + r.slice(1)}
                          </option>
                        ))}
                      </select>,
                    )}
                    {field("Mobile number", <input type="tel" name="parent_phone" minLength={6} placeholder="Enter mobile number" />)}
                    {field("Email address", <input type="email" name="parent_email" placeholder="Enter email address" />)}
                  </>
                ) : null}
                {field("Address", <input name="address" defaultValue={s?.address ?? ""} placeholder="Enter address" />, false, true)}
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
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : editing ? "Save changes" : "Create student"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
