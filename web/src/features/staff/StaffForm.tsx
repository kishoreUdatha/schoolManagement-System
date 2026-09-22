"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { EMPLOYMENT_LABEL, ROLE_LABEL, type Department, type EmploymentType, type Staff, type StaffRole } from "./types";

/** The form id the page-head button submits. */
export const STAFF_FORM = "staff-form";

type Created = { staff: Staff; temporary_password: string };

/**
 * SCR-081 Add Staff (POST /staff, which also creates the login and returns a
 * one-time password) and SCR-083 Edit Staff (PATCH /staff/{id}). Email and
 * role cannot change after creation, so edit shows them read-only.
 */
export function StaffForm({ mode }: { mode: "add" | "edit" }) {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const editing = mode === "edit";

  const existing = useApi<Staff>(editing && id ? `/api/v1/school/staff/${id}` : null);
  const departments = useApi<Department[]>("/api/v1/school/departments");
  const colleagues = useApi<Staff[]>("/api/v1/school/staff", { status: "active" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  if (editing && !id) return <PickFirst what="member of staff to edit" href={routeOf(80)} cta="Open the staff directory" />;
  if (editing && existing.loading && !existing.data) return <Loading what="Loading the staff record…" />;
  if (editing && !existing.data) return <ErrorNote>{existing.error ?? "Staff member not found."}</ErrorNote>;
  const s = existing.data;

  if (created) {
    return (
      <section className="panel">
        <div className="panel-pad">
          <div className="tip" style={{ marginBottom: 16 }}>
            <Icon name="shield" className="sm" />
            <span>{`${created.staff.full_name} can now sign in. Share this temporary password once; it is not stored and cannot be shown again.`}</span>
          </div>
          <dl className="kv">
            <div>
              <dt>Email address</dt>
              <dd>{created.staff.email ?? "—"}</dd>
            </div>
            <div>
              <dt>Temporary password</dt>
              <dd className="mono">{created.temporary_password}</dd>
            </div>
          </dl>
          <div className="gap" />
          <Link href={`${routeOf(82)}?id=${created.staff.id}`} className="btn primary">
            <Icon name="arrow" className="sm" />
            Open the staff profile
          </Link>
        </div>
      </section>
    );
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    const dept = text("department_id");
    const int = (k: string) => (text(k) === null ? null : Number(text(k)));
    const common = {
      full_name: text("full_name"),
      phone: text("phone"),
      employee_no: text("employee_no"),
      designation: text("designation"),
      joining_date: text("joining_date"),
      department_id: dept ? Number(dept) : null,
      qualification_summary: text("qualification_summary"),
      experience_years: text("experience_years"),
      employment_type: text("employment_type"),
      reporting_manager_id: int("reporting_manager_id"),
      address: text("address"),
      emergency_contact_name: text("emergency_contact_name"),
      emergency_contact_phone: text("emergency_contact_phone"),
      emergency_contact_relation: text("emergency_contact_relation"),
      max_periods_per_week: int("max_periods_per_week"),
      other_duty_periods: int("other_duty_periods"),
      other_duties: text("other_duties"),
    };
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.patch(`/api/v1/school/staff/${id}`, common);
        notify("Staff record updated.");
        router.push(`${routeOf(82)}?id=${id}`);
        return;
      }
      const res = await api.post<Created>("/api/v1/school/staff", { ...common, email: text("email"), role: text("role") ?? "teacher" });
      notify("Staff member created.");
      setCreated(res);
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
    <div className="two-col">
      <form id={STAFF_FORM} className="panel" onSubmit={submit}>
        <div className="steps">
          {["Basic details", "Academic & contact", "Documents", "Review"].map((t, i) => (
            <div key={t} className={`step ${i === 0 ? "active" : ""}`}>
              <b>{i + 1}</b>
              {t}
            </div>
          ))}
        </div>
        <div className="panel-pad">
          <ErrorNote>{error ?? departments.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Staff information</h3>
              </div>
              <div className="form-grid">
                {field("Staff name", <input name="full_name" required minLength={2} maxLength={160} defaultValue={s?.full_name} placeholder="Enter staff name" />, true)}
                {field("Employee no.", <input name="employee_no" required maxLength={40} defaultValue={s?.employee_no} placeholder="Enter employee no." />, true)}
                {field(
                  "Department",
                  <select name="department_id" defaultValue={s?.department_id ?? ""}>
                    <option value="">{departments.data?.length ? "No department" : "No departments set up yet"}</option>
                    {departments.data?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>,
                )}
                {field("Designation", <input name="designation" maxLength={120} defaultValue={s?.designation ?? ""} placeholder="e.g. Mathematics Teacher" />)}
                {field(
                  "Role",
                  editing ? (
                    <input value={s ? ROLE_LABEL[s.role] : ""} readOnly />
                  ) : (
                    <select name="role" defaultValue="teacher" required>
                      {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  ),
                  !editing,
                )}
                {field("Joining date", <input type="date" name="joining_date" defaultValue={s?.joining_date ?? ""} />)}
              </div>
            </section>
            <section>
              <div className="form-section-title">
                <span className="number">02</span>
                <h3>Contact & additional information</h3>
              </div>
              <div className="form-grid">
                {field("Mobile number", <input type="tel" name="phone" maxLength={20} defaultValue={s?.phone ?? ""} placeholder="Enter mobile number" />)}
                {editing
                  ? field("Email address", <input value={s?.email ?? ""} readOnly />)
                  : field("Email address", <input type="email" name="email" required minLength={3} maxLength={255} placeholder="Used to sign in" />, true)}
                {field("Qualification", <input name="qualification_summary" maxLength={200} defaultValue={s?.qualification_summary ?? ""} placeholder="e.g. M.Sc. Mathematics, B.Ed." />)}
                {field("Experience (years)", <input type="number" name="experience_years" min={0} max={70} step="0.5" defaultValue={s?.experience_years ?? ""} placeholder="e.g. 6" />)}
                {field(
                  "Employment type",
                  <select name="employment_type" defaultValue={s?.employment_type ?? ""}>
                    <option value="">Not set</option>
                    {(Object.keys(EMPLOYMENT_LABEL) as EmploymentType[]).map((k) => (
                      <option key={k} value={k}>
                        {EMPLOYMENT_LABEL[k]}
                      </option>
                    ))}
                  </select>,
                )}
                {field(
                  "Reporting manager",
                  <select name="reporting_manager_id" defaultValue={s?.reporting_manager_id ?? ""} key={colleagues.data ? "loaded" : "loading"}>
                    <option value="">{colleagues.loading ? "Loading staff…" : "Not set"}</option>
                    {colleagues.data
                      ?.filter((c) => !s || c.id !== s.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {`${c.full_name}${c.designation ? ` · ${c.designation}` : ""}`}
                        </option>
                      ))}
                  </select>,
                )}
                {field("Address", <textarea name="address" rows={2} maxLength={2000} defaultValue={s?.address ?? ""} placeholder="Home address" />, false, true)}
                {field("Emergency contact", <input name="emergency_contact_name" maxLength={160} defaultValue={s?.emergency_contact_name ?? ""} placeholder="Name" />)}
                {field("Emergency phone", <input type="tel" name="emergency_contact_phone" maxLength={20} defaultValue={s?.emergency_contact_phone ?? ""} placeholder="Phone number" />)}
                {field("Relationship", <input name="emergency_contact_relation" maxLength={60} defaultValue={s?.emergency_contact_relation ?? ""} placeholder="e.g. Spouse" />)}
              </div>
              <p className="muted small">Each degree or certificate, with its evidence and verification, is recorded on the Qualifications screen (SCR-087); the line above is the summary shown on the profile.</p>
            </section>
            <section>
              <div className="form-section-title">
                <span className="number">03</span>
                <h3>Workload</h3>
              </div>
              <div className="form-grid">
                {field("Capacity (periods a week)", <input type="number" name="max_periods_per_week" min={0} max={80} defaultValue={s?.max_periods_per_week ?? ""} placeholder="Not set" />)}
                {field("Other duty periods a week", <input type="number" name="other_duty_periods" min={0} max={80} defaultValue={s?.other_duty_periods ?? ""} placeholder="0" />)}
                {field("Other duties", <input name="other_duties" maxLength={300} defaultValue={s?.other_duties ?? ""} placeholder="e.g. Exam cell, bus duty" />, false, true)}
              </div>
              {editing ? <p className="muted small">Email and role cannot be changed after creation. To change either, deactivate this account and create a new one.</p> : null}
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
              {saving ? "Saving…" : editing ? "Save changes" : "Create staff"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>Complete the record</h3>
          <div className="stepper">
            {[
              ["Basic details", "Name, employee no. and role"],
              ["Work details", "Department, designation and joining date"],
              ["Contact information", editing ? "Mobile, address and emergency contact" : "Email becomes the sign-in"],
              ["Review & save", editing ? "Check the information" : "A temporary password is shown once"],
            ].map(([t, p], i) => (
              <div key={t} className={`stepper-row ${i === 0 ? "done" : ""}`}>
                <span>{i === 0 ? <Icon name="check" className="sm" /> : i + 1}</span>
                <div>
                  <strong>{t}</strong>
                  <p>{p}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
