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

/** The people a school asks for when a child joins: both parents, and whoever else brings them. */
type PersonKey = "father" | "mother" | "other";
const PEOPLE: [key: PersonKey, title: string][] = [
  ["father", "Father"],
  ["mother", "Mother"],
  ["other", "Another guardian"],
];

type Made = { studentId: number; name: string; logins: { who: string; email: string; password: string }[] };

/**
 * SCR-056 Add Student (POST /students, then POST /students/{id}/guardians
 * for each parent given, and POST .../guardians/{id}/portal-access when a
 * parent login is asked for) and SCR-058 Edit Student (PATCH /students/{id}).
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
  const [primary, setPrimary] = useState<PersonKey>("father");
  const [wantLogin, setWantLogin] = useState(true);
  const [made, setMade] = useState<Made | null>(null);

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

  // The parent's password is returned once and never stored, so the child's
  // record waits behind this until the office has taken it down.
  if (made) {
    return (
      <section className="panel">
        <div className="panel-pad">
          <div className="tip" style={{ marginBottom: 16 }}>
            <Icon name="shield" className="sm" />
            <span>{`${made.name} is on the roll. Give the parent this password now — it is not stored and cannot be shown again.`}</span>
          </div>
          {made.logins.map((l) => (
            <dl className="kv" key={l.email}>
              <div>
                <dt>Parent</dt>
                <dd>{l.who}</dd>
              </div>
              <div>
                <dt>Sign in with</dt>
                <dd>{l.email}</dd>
              </div>
              <div>
                <dt>Temporary password</dt>
                <dd className="mono">{l.password}</dd>
              </div>
            </dl>
          ))}
          <div className="gap" />
          <div className="row">
            <button type="button" className="btn primary" onClick={() => router.push(`${routeOf(57)}?id=${made.studentId}`)}>
              <Icon name="arrow" className="sm" />
              Open the student
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setMade(null);
                router.push(routeOf(56));
              }}
            >
              Add another student
            </button>
          </div>
        </div>
      </section>
    );
  }

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
      // Each parent the office filled in. The student exists by now, so a
      // parent that will not save is said out loud rather than losing both.
      const logins: Made["logins"] = [];
      for (const [key, title] of PEOPLE) {
        const name = text(`${key}_name`);
        if (!name) continue;
        const email = text(`${key}_email`);
        const isPrimary = key === primary;
        try {
          const guardians = await api.post<{ guardian_id: number; email: string | null; relation: string }[]>(
            `/api/v1/school/students/${created.id}/guardians`,
            {
              full_name: name,
              phone: text(`${key}_phone`),
              email,
              occupation: text(`${key}_occupation`),
              relation: key === "other" ? (text("other_relation") ?? "guardian") : key,
              is_primary: isPrimary,
              can_pickup: true,
              is_emergency_contact: true,
              lives_with_student: true,
            },
          );
          // a login for the contact the school calls first, if they gave an email
          if (wantLogin && isPrimary && email) {
            const mine = guardians.find((g) => g.email === email) ?? guardians[guardians.length - 1];
            const grant = await api.post<{ email: string; temporary_password: string }>(
              `/api/v1/school/students/${created.id}/guardians/${mine.guardian_id}/portal-access`,
            );
            logins.push({ who: name, email: grant.email, password: grant.temporary_password });
          }
        } catch (err) {
          notify(`${title} was not saved: ${errorText(err)}`);
        }
      }
      if (logins.length) {
        setMade({ studentId: created.id, name: String(f.get("full_name") ?? "").trim(), logins });
        return;
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
                {field("Address", <input name="address" defaultValue={s?.address ?? ""} placeholder="Enter address" />, false, true)}
              </div>
            </section>
            {!editing ? (
              <section>
                <div className="form-section-title">
                  <span className="number">03</span>
                  <h3>Parents</h3>
                </div>
                <p className="muted small" style={{ margin: "0 0 12px" }}>
                  Fill in whoever the school will deal with. Leave a block empty and it is not saved; you can add more family later on the
                  child&apos;s profile.
                </p>
                {PEOPLE.map(([key, title]) => (
                  <div key={key} className="parent-block">
                    <div className="parent-head">
                      <h4>{title}</h4>
                      <label className="row" style={{ gap: 6, fontSize: 13 }}>
                        <input type="radio" name="primary" checked={primary === key} onChange={() => setPrimary(key)} />
                        School calls them first
                      </label>
                    </div>
                    <div className="form-grid">
                      {field(`${title === "Another guardian" ? "Their" : title + "'s"} name`, <input name={`${key}_name`} minLength={2} placeholder="Full name" />)}
                      {key === "other"
                        ? field(
                            "Relationship",
                            <select name="other_relation" defaultValue="guardian">
                              {RELATIONS.map((r) => (
                                <option key={r} value={r}>
                                  {r[0].toUpperCase() + r.slice(1)}
                                </option>
                              ))}
                            </select>,
                          )
                        : field("Occupation", <input name={`${key}_occupation`} maxLength={120} placeholder="e.g. Teacher" />)}
                      {field("Mobile number", <input type="tel" name={`${key}_phone`} minLength={6} placeholder="Enter mobile number" />)}
                      {field("Email address", <input type="email" name={`${key}_email`} placeholder="Their sign-in for the parent portal" />)}
                    </div>
                  </div>
                ))}
                <label className="row" style={{ gap: 8, fontSize: 13, marginTop: 4 }}>
                  <input type="checkbox" checked={wantLogin} onChange={(e) => setWantLogin(e.target.checked)} />
                  Create a parent login for the first contact, so they can see attendance, marks and fees. Needs their email address.
                </label>
              </section>
            ) : null}
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
