"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, KV } from "./kit";
import type { MyProfile as Profile } from "./types";

const URL = "/api/v1/staff/profile";

/** The blank form, and the shape the PATCH takes. */
const FIELDS = [
  "phone", "address", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
  "qualification_summary", "experience_years", "bank_name", "bank_account_no", "bank_ifsc", "pan", "uan",
] as const;
type Editable = Record<(typeof FIELDS)[number], string>;
const blank = Object.fromEntries(FIELDS.map((f) => [f, ""])) as Editable;

const RELATIONS = ["Spouse", "Parent", "Sibling", "Child", "Friend", "Other"];

/**
 * NEW-097, live: GET /staff/profile and PATCH /staff/profile. What the office
 * decides — name, employee number, role, department, salary — is shown but not
 * editable here; the contact, emergency and bank details are the person's own
 * to keep up. Bank details go to payroll: the account a salary revision names
 * wins, and this one is used when it names none.
 */
export function MyProfile() {
  const me = useApi<Profile>(URL);
  const [f, setF] = useState<Editable>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // fill the form once the record arrives, and again after a save
  const loaded = me.data;
  useEffect(() => {
    if (!loaded) return;
    setF(Object.fromEntries(FIELDS.map((k) => [k, loaded[k] == null ? "" : String(loaded[k])])) as Editable);
  }, [loaded]);

  if (me.loading && !me.data) return <Loading what="Loading your record…" />;
  if (!me.data) return <ErrorNote>{me.error ?? "Your staff record could not be read."}</ErrorNote>;
  const p = me.data;
  const set = (k: keyof Editable) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string | number | null> = {};
      for (const k of FIELDS) {
        const v = f[k].trim();
        body[k] = k === "experience_years" ? (v ? Number(v) : null) : v || null;
      }
      // the bank wants these as they are printed
      for (const k of ["bank_ifsc", "pan"] as const) if (body[k]) body[k] = String(body[k]).toUpperCase();
      await api.patch(URL, body);
      notify("Your details are saved.");
      me.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const bankOnFile = p.bank_account_no ? `${p.bank_name ?? "Account"} · ${p.bank_account_no}` : "Not given yet";

  return (
    <form id="my-profile" onSubmit={save}>
      <ErrorNote>{error}</ErrorNote>
      <Panel title={p.full_name} sub={`${label(p.role)}${p.designation ? ` · ${p.designation}` : ""} · ${p.employee_no}`}>
        <KV
          rows={[
            ["Email (your sign-in)", p.email ?? "—"],
            ["Department", p.department_name ?? "—"],
            ["Joined", p.joining_date ? date(p.joining_date) : "—"],
            ["Employment", p.employment_type ? label(p.employment_type) : "—"],
            ["Reports to", p.reporting_manager_name ?? "—"],
            ["Salary paid to", bankOnFile],
          ]}
        />
        <p className="muted small" style={{ marginTop: 10 }}>
          Your name, employee number, role and pay are the office&apos;s to change. Ask them if any of it is wrong.
        </p>
      </Panel>
      <div className="gap" />
      <Panel title="How to reach you" sub="Used for school messages and in an emergency">
        <div className="form-grid">
          <Field label="Mobile number">
            <input value={f.phone} onChange={set("phone")} maxLength={20} placeholder="e.g. 9876543210" />
          </Field>
          <Field label="Qualification">
            <input value={f.qualification_summary} onChange={set("qualification_summary")} maxLength={200} placeholder="e.g. M.Sc Mathematics, B.Ed" />
          </Field>
          <Field label="Years of experience">
            <input type="number" min={0} max={70} step="0.5" value={f.experience_years} onChange={set("experience_years")} />
          </Field>
          <Field label="Address" full>
            <textarea rows={2} value={f.address} onChange={set("address")} maxLength={2000} placeholder="Where you live" />
          </Field>
          <Field label="In an emergency, call">
            <input value={f.emergency_contact_name} onChange={set("emergency_contact_name")} maxLength={160} placeholder="Their name" />
          </Field>
          <Field label="Their number">
            <input value={f.emergency_contact_phone} onChange={set("emergency_contact_phone")} maxLength={20} />
          </Field>
          <Field label="Who they are">
            <select value={f.emergency_contact_relation} onChange={set("emergency_contact_relation")}>
              <option value="">Choose…</option>
              {RELATIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Panel>
      <div className="gap" />
      <Panel title="Where your salary goes" sub="Payroll pays into this account and prints these numbers on your payslip">
        <div className="form-grid">
          <Field label="Bank">
            <input value={f.bank_name} onChange={set("bank_name")} maxLength={120} placeholder="e.g. State Bank of India" />
          </Field>
          <Field label="Account number">
            <input value={f.bank_account_no} onChange={set("bank_account_no")} inputMode="numeric" maxLength={34} placeholder="Digits only" />
          </Field>
          <Field label="IFSC">
            <input value={f.bank_ifsc} onChange={set("bank_ifsc")} maxLength={11} placeholder="e.g. SBIN0001234" style={{ textTransform: "uppercase" }} />
          </Field>
          <Field label="PAN">
            <input value={f.pan} onChange={set("pan")} maxLength={10} placeholder="e.g. ABCDE1234F" style={{ textTransform: "uppercase" }} />
          </Field>
          <Field label="UAN (provident fund)">
            <input value={f.uan} onChange={set("uan")} inputMode="numeric" maxLength={12} placeholder="12 digits" />
          </Field>
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          Check the account number and IFSC before saving. A wrong one holds your salary up until the office notices.
        </p>
      </Panel>
      <div className="gap" />
      <div className="form-footer">
        <span>Only you and the office can see this.</span>
        <div className="actions">
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Save my details"}
          </button>
        </div>
      </div>
    </form>
  );
}
