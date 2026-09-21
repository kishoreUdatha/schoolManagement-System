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
import { ROLE_LABEL, type Department, type Staff, type StaffRole } from "./types";

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
    const common = {
      full_name: text("full_name"),
      phone: text("phone"),
      employee_no: text("employee_no"),
      designation: text("designation"),
      joining_date: text("joining_date"),
      department_id: dept ? Number(dept) : null,
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
                {/* Not wired: qualification, experience, address and reporting manager — the staff record has no such fields. Qualifications are recorded on SCR-087. */}
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
              ["Contact information", editing ? "Mobile number" : "Email becomes the sign-in"],
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
