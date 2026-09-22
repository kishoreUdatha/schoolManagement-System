"use client";

/*
 * PM-043 · Health & emergency. The parent-visible health record from
 * GET …/health: allergies, conditions, emergency contact, clinic visits and
 * vaccinations. Parents may update the fields the API accepts from them
 * (PUT …/health/profile, a partial update); blood group and the school's own
 * notes are not shown as editable, and the school's internal notes are not
 * shown at all. Counselling records are never part of this endpoint.
 */

import { useState, type FormEvent } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date, dateTime, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmError, PmLoading, orNull, useChildPath } from "../support/pm";

type Profile = {
  allergies: string | null;
  chronic_conditions: string | null;
  current_medications: string | null;
  dietary_restrictions: string | null;
  disabilities: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  blood_group: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
};

type Visit = {
  id: number;
  visited_at: string;
  complaint: string;
  treatment: string | null;
  outcome: string;
  follow_up_on: string | null;
};

type Immunization = { id: number; vaccine: string; dose: string | null; given_on: string | null; next_due_on: string | null };

type HealthRecord = { profile: Profile; visits: Visit[]; immunizations: Immunization[] };

/** The profile fields a parent edits here (all accepted by ProfileIn). */
const EDITABLE = [
  ["allergies", "Allergies"],
  ["chronic_conditions", "Medical conditions"],
  ["current_medications", "Current medication"],
  ["dietary_restrictions", "Dietary restrictions"],
  ["emergency_contact_name", "Emergency contact name"],
  ["emergency_contact_relation", "Emergency contact relation"],
  ["emergency_contact_phone", "Emergency contact phone"],
  ["doctor_name", "Family doctor"],
  ["doctor_phone", "Doctor’s phone"],
] as const;

type Key = (typeof EDITABLE)[number][0];

export function HealthEmergency() {
  return (
    <ChildGate>
      <Health />
    </ChildGate>
  );
}

function Health() {
  const { notify, go } = useParent();
  const base = useChildPath();
  const rec = useApi<HealthRecord>(base && `${base}/health`);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<Key, string>>({} as Record<Key, string>);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (rec.loading && !rec.data) return <PmLoading />;
  if (!rec.data) return <PmError>{rec.error}</PmError>;
  const p = rec.data.profile;

  function startEdit() {
    setForm(Object.fromEntries(EDITABLE.map(([k]) => [k, p[k] ?? ""])) as Record<Key, string>);
    setErr(null);
    setEditing(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!base) return;
    setBusy(true);
    setErr(null);
    try {
      await api.put(`${base}/health/profile`, Object.fromEntries(EDITABLE.map(([k]) => [k, orNull(form[k] ?? "")])));
      notify("Health information updated. The school nurse will see the change.");
      setEditing(false);
      rec.reload();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  const contact = [p.emergency_contact_name, p.emergency_contact_relation && label(p.emergency_contact_relation), p.emergency_contact_phone]
    .filter(Boolean)
    .join(" · ");
  const doctor = [p.doctor_name, p.doctor_phone].filter(Boolean).join(" · ");

  return (
    <>
      <div className="panel soft">
        <span className="eyebrow">SCHOOL HEALTH RECORD</span>
        <h2>Health information</h2>
        <p>
          Keep the school informed of any changes.
          {p.updated_at ? ` Last updated ${date(p.updated_at)}${p.updated_by_name ? ` by ${p.updated_by_name}` : ""}.` : ""}
        </p>
      </div>
      <PmError>{err || rec.error}</PmError>

      {editing ? (
        <form onSubmit={save}>
          {EDITABLE.map(([k, text]) => (
            <label key={k} className="field">
              {text}
              {k === "allergies" || k === "chronic_conditions" || k === "current_medications" ? (
                <textarea rows={2} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              ) : (
                <input
                  type={k.endsWith("phone") ? "tel" : "text"}
                  value={form[k] ?? ""}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              )}
            </label>
          ))}
          <button className="action" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save health information"}
          </button>
          <button className="action secondary" type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <dl>
            <div>
              <dt>Allergies</dt>
              <dd>{p.allergies ?? "None reported"}</dd>
            </div>
            <div>
              <dt>Medical conditions</dt>
              <dd>{p.chronic_conditions ?? "None reported"}</dd>
            </div>
            <div>
              <dt>Current medication</dt>
              <dd>{p.current_medications ?? "None reported"}</dd>
            </div>
            {p.dietary_restrictions ? (
              <div>
                <dt>Dietary restrictions</dt>
                <dd>{p.dietary_restrictions}</dd>
              </div>
            ) : null}
            {p.blood_group ? (
              <div>
                <dt>Blood group</dt>
                <dd>{p.blood_group}</dd>
              </div>
            ) : null}
            <div>
              <dt>Emergency contact</dt>
              <dd>{contact || "Not recorded"}</dd>
            </div>
            <div>
              <dt>Family doctor</dt>
              <dd>{doctor || "Not recorded"}</dd>
            </div>
          </dl>

          <section className="section">
            <h3>Clinic visit updates</h3>
            {rec.data.visits.length === 0 ? (
              <div className="item">
                <span>
                  <strong>Clinic visits</strong>
                  <small>Only information shared with parents</small>
                </span>
                <span className="value">No visits</span>
              </div>
            ) : (
              rec.data.visits.slice(0, 10).map((v) => (
                <div key={v.id} className="item">
                  <span>
                    <strong>{v.complaint}</strong>
                    <small>
                      {dateTime(v.visited_at)}
                      {v.treatment ? ` · ${v.treatment}` : ""}
                      {v.follow_up_on ? ` · Follow-up ${date(v.follow_up_on)}` : ""}
                    </small>
                  </span>
                  <span className={v.outcome === "referred_hospital" || v.outcome === "sent_home" ? "value warning" : "value"}>
                    {label(v.outcome)}
                  </span>
                </div>
              ))
            )}
          </section>

          {rec.data.immunizations.length ? (
            <section className="section">
              <h3>Vaccinations</h3>
              {rec.data.immunizations.map((i) => (
                <div key={i.id} className="item">
                  <span>
                    <strong>
                      {i.vaccine}
                      {i.dose ? ` · ${i.dose}` : ""}
                    </strong>
                    <small>{i.given_on ? `Given ${date(i.given_on)}` : "Not yet given"}</small>
                  </span>
                  <span className="value">{i.next_due_on ? `Next ${date(i.next_due_on)}` : ""}</span>
                </div>
              ))}
            </section>
          ) : null}

          <button className="action" onClick={startEdit}>
            Update health information
          </button>
          <button className="action secondary" onClick={() => go(45)}>
            Contact school office
          </button>
        </>
      )}
      <p className="micro">Private counselling notes are not shown in the parent app.</p>
    </>
  );
}
