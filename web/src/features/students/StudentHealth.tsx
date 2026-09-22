"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Kv, StudentFrame } from "./StudentFrame";
import { StudentTabs } from "./StudentProfile";
import type { HealthRecord, HealthTextKey } from "./records";
import type { StudentProfile } from "./types";

const FIELDS: [HealthTextKey, string][] = [
  ["allergies", "Allergies"],
  ["chronic_conditions", "Medical conditions"],
  ["current_medications", "Current medication"],
  ["dietary_restrictions", "Diet restrictions"],
  ["disabilities", "Disabilities / special needs"],
  ["doctor_name", "Family doctor"],
  ["doctor_phone", "Doctor's phone"],
  ["emergency_contact_name", "Emergency contact"],
  ["emergency_contact_phone", "Emergency phone"],
  ["emergency_contact_relation", "Relation"],
  ["insurance_provider", "Insurance"],
  ["insurance_policy_no", "Policy no."],
  ["notes", "Notes"],
];

/** SCR-065, live: GET /health/students/{id}, PUT /health/students/{id}/profile. */
export function StudentHealth() {
  return (
    <StudentFrame active={65} banner={false}>
      {(s) => <Body s={s} />}
    </StudentFrame>
  );
}

function Body({ s }: { s: StudentProfile }) {
  const rec = useApi<HealthRecord>(`/api/v1/school/health/students/${s.id}`);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const open = () => setEditing(true);
    window.addEventListener("student-health:edit", open);
    return () => window.removeEventListener("student-health:edit", open);
  }, []);

  const r = rec.data;
  const p = r?.profile;
  const v = (k: HealthTextKey) => p?.[k] || "—";
  const consent =
    p?.guardian_consent === true
      ? `Given${p.consent_given_by ? ` by ${p.consent_given_by}` : ""}${p.consent_on ? ` on ${date(p.consent_on)}` : ""}`
      : p?.guardian_consent === false
        ? `Refused${p.consent_given_by ? ` by ${p.consent_given_by}` : ""}${p.consent_on ? ` on ${date(p.consent_on)}` : ""}`
        : "Not recorded";
  const emergency = p?.emergency_contact_name || p?.emergency_contact_phone ? [p?.emergency_contact_name, p?.emergency_contact_relation ? `(${p.emergency_contact_relation})` : null, p?.emergency_contact_phone].filter(Boolean).join(" · ") : "—";
  const lastCheckup = r?.checkups.map((c) => c.checked_on).sort().at(-1);
  const todayIso = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const lastVisit = r?.visits.map((x) => x.visited_at).sort().at(-1);
  const n = (v: number) => (rec.loading && !r ? "…" : String(v));
  const stats = [
    { label: "Clinic visits", value: n(r?.visits.length ?? 0), note: lastVisit ? `Last on ${date(lastVisit)}` : "None recorded" },
    { label: "Follow-ups due", value: n((r?.visits ?? []).filter((x) => x.follow_up_on && x.follow_up_on >= todayIso).length), note: "From clinic visits" },
    { label: "Vaccines due", value: n((r?.immunizations ?? []).filter((x) => x.next_due_on && x.next_due_on <= in30).length), note: "Overdue or within 30 days" },
    { label: "Last check-up", value: rec.loading && !r ? "…" : lastCheckup ? date(lastCheckup) : "—", note: `${r?.checkups.length ?? 0} check-up(s) on record` },
  ];

  const rows: Row[] = (r?.visits ?? []).slice(0, 10).map((x) => [
    date(x.visited_at),
    x.complaint,
    [x.treatment, x.medicine_given, label(x.outcome)].filter((y) => y && y !== "—").join(" · ") || "—",
    x.recorded_by_name ?? "—",
  ]);

  const followUps = [
    ...(r?.visits ?? []).filter((x) => x.follow_up_on).map((x) => ({ at: x.follow_up_on as string, icon: "calendar" as const, title: `Follow up: ${x.complaint}`, sub: x.parent_notified ? "Parent notified" : "Parent not yet notified" })),
    ...(r?.immunizations ?? []).filter((x) => x.next_due_on).map((x) => ({ at: x.next_due_on as string, icon: "check" as const, title: `${x.vaccine}${x.dose ? ` · ${x.dose}` : ""} due`, sub: "Immunisation" })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 4);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    const c = text("guardian_consent");
    const body = {
      ...Object.fromEntries(FIELDS.map(([k]) => [k, text(k)])),
      guardian_consent: c === "yes" ? true : c === "no" ? false : null,
      consent_given_by: text("consent_given_by"),
      consent_on: text("consent_on"),
    };
    setBusy(true);
    setError(null);
    try {
      await api.put(`/api/v1/school/health/students/${s.id}/profile`, body);
      notify("Health record updated.");
      setEditing(false);
      rec.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel profile-banner">
        <div className="profile-hero">
          <div className="row">
            <span className="avatar mint large">{initials(s.full_name)}</span>
            <div>
              <h2>{s.full_name}</h2>
              <p>{`${r?.section_label ?? `${s.class_name ?? ""} ${s.section_name ?? ""}`} · Health record`}</p>
            </div>
          </div>
          <span className={`badge ${p?.guardian_consent === true ? "" : "warn"}`} title="Guardian consent for first aid and medicine at school">
            {`Consent: ${p?.guardian_consent === true ? "given" : p?.guardian_consent === false ? "refused" : "not recorded"}`}
          </span>
          <span className={`badge ${p?.allergies ? "warn" : ""}`}>{p?.updated_at ? `Updated ${date(p.updated_at)}` : "No health profile yet"}</span>
        </div>
        <StudentTabs id={String(s.id)} active={65} />
      </div>
      <StatStrip items={stats} compact />
      <ErrorNote>{error ?? rec.error}</ErrorNote>
      {editing && r ? (
        <Panel title="Update health record" sub="Blood group is kept on the student record">
          <form onSubmit={save}>
            <div className="form-grid">
              {FIELDS.map(([k, t]) => (
                <label key={k} className={`field ${k === "notes" ? "full" : ""}`}>
                  <span>{t}</span>
                  {k === "notes" ? <textarea name={k} defaultValue={p?.[k] ?? ""} /> : <input name={k} defaultValue={p?.[k] ?? ""} />}
                </label>
              ))}
              <label className="field">
                <span>Guardian consent</span>
                <select name="guardian_consent" defaultValue={p?.guardian_consent === true ? "yes" : p?.guardian_consent === false ? "no" : ""}>
                  <option value="">Not recorded</option>
                  <option value="yes">Given</option>
                  <option value="no">Refused</option>
                </select>
              </label>
              <label className="field">
                <span>Consent given by</span>
                <input name="consent_given_by" maxLength={160} defaultValue={p?.consent_given_by ?? ""} placeholder="Guardian's name" />
              </label>
              <label className="field">
                <span>Consent date</span>
                <input type="date" name="consent_on" max={new Date().toISOString().slice(0, 10)} defaultValue={p?.consent_on ?? ""} />
              </label>
            </div>
            <div className="form-footer">
              <span>Leave a field blank to clear it</span>
              <div className="actions">
                <button type="button" className="btn" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={busy}>
                  <Icon name="check" className="sm" />
                  {busy ? "Saving…" : "Save health record"}
                </button>
              </div>
            </div>
          </form>
        </Panel>
      ) : null}
      <div className="two-col">
        <div className="stack">
          <Panel title="Medical information">
            <Kv
              rows={[
                ["Student", s.full_name],
                ["Blood group", p?.blood_group ?? s.blood_group ?? "—"],
                ["Medical conditions", p?.chronic_conditions || "No other conditions reported"],
                ["Current medication", v("current_medications")],
                ["Primary physician", [p?.doctor_name, p?.doctor_phone].filter(Boolean).join(" · ") || "—"],
                ["Emergency contact", emergency],
                ["Guardian consent", consent],
                ["Last check-up", date(lastCheckup)],
              ]}
            />
          </Panel>
          <Panel title="Recent clinic visits" sub={r ? `${r.visits.length} on record` : undefined} flush>
            <DataTable
              columns={["Date", "Reason", "Action taken", "Recorded by"]}
              rows={rows}
              selectable={false}
              rowAction={false}
              empty={rec.loading ? "Loading visits…" : "No clinic visits recorded."}
            />
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Allergy alert">
            {p?.allergies ? (
              <div className="tip warn">
                <Icon name="bell" className="sm" />
                <span>{`${p.allergies} recorded. Check the care plan before serving food or medicine.`}</span>
              </div>
            ) : null}
            <Kv
              rows={[
                ["Allergies", p?.allergies || "None recorded"],
                ["Diet restrictions", v("dietary_restrictions")],
                ["Emergency contact", emergency],
              ]}
            />
          </Panel>
          <Panel title="Follow-up">
            {followUps.length ? (
              followUps.map((t, i) => (
                <div className="timeline-item" key={i}>
                  <span className="timeline-dot">
                    <Icon name={t.icon} />
                  </span>
                  <div>
                    <h4>{t.title}</h4>
                    <p>{t.sub}</p>
                  </div>
                  <time>{date(t.at).slice(0, 6)}</time>
                </div>
              ))
            ) : (
              <p className="muted">{p?.updated_at ? `Profile last updated ${dateTime(p.updated_at)}${p.updated_by_name ? ` by ${p.updated_by_name}` : ""}.` : "Nothing to follow up."}</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}

/** "Update health record" in the page head; opens the form in the screen body. */
export function UpdateHealthButton() {
  return (
    <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new Event("student-health:edit"))}>
      <Icon name="check" className="sm" />
      Update health record
    </button>
  );
}
