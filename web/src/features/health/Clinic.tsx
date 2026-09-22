"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { Field, Kv, Modal, ModalActions, SearchBox, StudentPicker, addDays, formText, time12, today, useDebounced, type PickedStudent } from "@/features/transport/kit";
import type { Alert, Appointment, Dose, Due, FirstAid, HealthDashboard, HealthRecord, ProfileRow, Visit, VisitOutcome } from "./types";

export const HEALTH = "/api/v1/school/health";
export const WELL = "/api/v1/school/wellbeing";

export const OUTCOMES: Record<VisitOutcome, string> = {
  back_to_class: "Back to class",
  rested: "Rested in clinic",
  sent_home: "Sent home",
  parent_picked_up: "Parent picked up",
  referred_hospital: "Referred to hospital",
};

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

/** SCR-216, live: /health/dashboard, /health/visits (?on= each of the last six days), /wellbeing/counselling/appointments (today), /health/immunizations-due. */
export function HealthDashboardView() {
  const session = useSession();
  const dash = useApi<HealthDashboard>(`${HEALTH}/dashboard`);
  const todayVisits = useApi<Visit[]>(`${HEALTH}/visits`, { on: today() });
  const appts = useApi<Appointment[]>(`${WELL}/counselling/appointments`, { from: today(), to: today() });
  const due = useApi<Due[]>(`${HEALTH}/immunizations-due`, { within_days: 30 });
  const [week, setWeek] = useState<{ day: string; n: number }[] | null>(null);

  useEffect(() => {
    let live = true;
    const days = [5, 4, 3, 2, 1, 0].map((k) => addDays(today(), -k));
    Promise.all(days.map((d) => api.get<Visit[]>(`${HEALTH}/visits`, { on: d }).then((v) => ({ day: d, n: v.length }))))
      .then((r) => live && setWeek(r))
      .catch(() => live && setWeek([]));
    return () => {
      live = false;
    };
  }, []);

  const d = dash.data;
  const now = new Date();
  const first = session?.user.full_name.split(/\s+/)[0];
  const hour = now.getHours();
  const stats = [
    { label: "Visits today", value: d ? String(d.visits_today) : "…", note: d ? `${d.sent_home_today} sent home · ${d.referred_today} referred` : "Clinic visits" },
    { label: "Follow-ups", value: d ? String(d.follow_ups_due) : "…", note: "Due from earlier visits" },
    { label: "Health alerts", value: d ? String(d.students_with_alerts) : "…", note: "Allergies or conditions on file" },
    { label: "Immunisations due", value: d ? String(d.immunizations_due) : "…", note: "Coming due" },
  ];
  const max = Math.max(1, ...(week ?? []).map((w) => w.n));

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow">{`${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`}</div>
          <h2>{`${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}${first ? `, ${first}` : ""}.`}</h2>
          <p>Here’s what the clinic and counselling desks have today.</p>
          <Link href={routeOf(217)} className="btn white">
            <Icon name="arrow" className="sm" />
            Find a health record
          </Link>
        </div>
        <HeroArt />
      </section>
      <ErrorNote>{dash.error}</ErrorNote>
      <StatStrip items={stats} />
      <div className="dashboard-actions">
        <span className="small strong muted">Quick actions</span>
        <div className="quick-row">
          <Link className="quick-action" href={routeOf(218)}>
            <Icon name="heart" />
            Record clinic visit
          </Link>
          <Link className="quick-action" href={routeOf(219)}>
            <Icon name="check" />
            Record medication
          </Link>
          <Link className="quick-action" href={routeOf(220)}>
            <Icon name="shield" />
            Immunisation
          </Link>
          <Link className="quick-action" href={routeOf(221)}>
            <Icon name="calendar" />
            Counselling diary
          </Link>
        </div>
      </div>
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <Panel title="Clinic visits" sub="Last six days">
            {week ? (
              <svg className="chart-svg" viewBox="0 0 640 225" role="img" aria-label="Clinic visits over the last six days">
                {[0, 1, 2, 3].map((i) => (
                  <Fragment key={i}>
                    <path d={`M38 ${20 + i * 51}H620`} stroke="#e9eff8" strokeDasharray="3 4" />
                    <text x="7" y={24 + i * 51} fill="#91a2ba" fontSize="10" fontFamily="Manrope">
                      {Math.round(max - (i * max) / 3)}
                    </text>
                  </Fragment>
                ))}
                {week.map((w, i) => {
                  const h = (w.n / max) * 153;
                  return (
                    <Fragment key={w.day}>
                      <rect x={65 + i * 92} y={173 - h} width="31" height={h} rx="5" fill={i === 5 ? "#2563eb" : "#73a6f5"} />
                      <text x={80 + i * 92} y={166 - h} textAnchor="middle" fill="#4e617d" fontSize="10" fontFamily="Manrope">
                        {w.n}
                      </text>
                      <text x={80 + i * 92} y="210" textAnchor="middle" fill="#8196b5" fontSize="10" fontFamily="Manrope">
                        {date(w.day).slice(0, 6)}
                      </text>
                    </Fragment>
                  );
                })}
              </svg>
            ) : (
              <p className="muted">Loading…</p>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Today’s schedule" action={<Link href={routeOf(221)} className="btn text">View all</Link>}>
            {(appts.data ?? []).map((a) => (
              <div className="event-row" key={a.id}>
                <div className="event-time">
                  {time12(a.scheduled_at).slice(0, 5)}
                  <small style={{ display: "block", fontSize: "9px" }}>{time12(a.scheduled_at).slice(6)}</small>
                </div>
                <div className="event-content">
                  <h4>Counselling appointment</h4>
                  <p>{`${a.student_name ?? "Student"}${a.counsellor_name ? ` · ${a.counsellor_name}` : ""}`}</p>
                </div>
                <Badge>{label(a.status)}</Badge>
              </div>
            ))}
            {appts.data && !appts.data.length ? <p className="muted">No counselling appointments today.</p> : null}
            {appts.error ? <p className="muted">{appts.error}</p> : null}
          </Panel>
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <Panel title="Today’s clinic visits" action={<Link href={routeOf(218)} className="btn text">Record visit</Link>}>
            {(todayVisits.data ?? []).slice(0, 6).map((v) => (
              <div className="timeline-item" key={v.id}>
                <span className="timeline-dot">
                  <Icon name="heart" />
                </span>
                <div>
                  <h4>{v.student_name}</h4>
                  <p>{`${v.section_label ?? ""} · ${OUTCOMES[v.outcome]}${v.parent_notified ? " · parent notified" : ""}`}</p>
                </div>
                <time>{dateTime(v.visited_at).split(", ")[1]}</time>
              </div>
            ))}
            {todayVisits.data && !todayVisits.data.length ? <p className="muted">No clinic visits recorded today.</p> : null}
          </Panel>
        </div>
        <aside>
          <Panel title="Coming up" sub="Immunisations due in 30 days">
            {(due.data ?? []).slice(0, 5).map((x, i) => (
              <div className="event-row" key={`${x.student_id}-${x.vaccine}-${i}`}>
                <div className="calendar-tile">
                  {x.next_due_on ? Number(x.next_due_on.slice(8, 10)) : "—"}
                  <small>{x.next_due_on ? date(x.next_due_on).slice(3, 6) : ""}</small>
                </div>
                <div className="event-content">
                  <h4>{x.vaccine}</h4>
                  <p>{x.student_name ?? x.full_name ?? "Student"}</p>
                </div>
                <Link href={`${routeOf(220)}?id=${x.student_id}`} className="btn text">
                  View
                </Link>
              </div>
            ))}
            {due.data && !due.data.length ? <p className="muted">Nothing due in the next 30 days.</p> : null}
          </Panel>
        </aside>
      </div>
    </>
  );
}

/** Choose a student for a health record screen: a search over /health/profiles. `route` for screens without an SCR number. */
export function RecordPicker({ screen, route }: { screen?: number; route?: string }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const search = useDebounced(typed.trim());
  const [only, setOnly] = useState(false);
  const rows = useApi<ProfileRow[]>(`${HEALTH}/profiles`, { search, with_profile_only: only || undefined });
  const items = rows.data ?? [];
  const table: Row[] = items.map((p) => [{ name: p.student_name, sub: p.admission_no }, p.section_label ?? "—", p.blood_group ?? "—", p.flags.length ? p.flags.map(label).join(", ") : "—", p.has_profile ? "On file" : "Not recorded"]);
  return (
    <>
      <div className="filterbar">
        <SearchBox value={typed} onChange={setTyped} placeholder="Search students by name or admission no…" />
        <select aria-label="Filter records" value={only ? "on" : ""} onChange={(e) => setOnly(e.target.value === "on")}>
          <option value="">All students</option>
          <option value="on">With a health profile</option>
        </select>
      </div>
      <ErrorNote>{rows.error}</ErrorNote>
      <Panel title="Health records" sub="Choose a student to open their record" flush>
        <DataTable columns={["Student", "Class", "Blood group", "Flags", "Profile status"]} rows={table} selectable={false} onView={(i) => router.push(`${route ?? routeOf(screen ?? 217)}?id=${items[i].student_id}`)} empty={rows.loading ? "Loading…" : "No students match."} />
      </Panel>
    </>
  );
}

export function useRecord() {
  const id = useSearchParams().get("id");
  const rec = useApi<HealthRecord>(id ? `${HEALTH}/students/${id}` : null);
  return { id, rec };
}

export function RecordBanner({ r }: { r: HealthRecord }) {
  const onFile = Boolean(r.profile.updated_at);
  return (
    <div className="panel profile-banner">
      <div className="profile-hero">
        <div className="row">
          <span className="avatar mint large">{initials(r.student_name)}</span>
          <div>
            <h2>{r.student_name}</h2>
            <p>{`${r.section_label ?? "—"} · Health record`}</p>
          </div>
        </div>
        <Badge>{onFile ? `Profile updated ${date(r.profile.updated_at)}` : "No health profile recorded"}</Badge>
      </div>
    </div>
  );
}

const PROFILE_FIELDS: [keyof HealthRecord["profile"], string][] = [
  ["allergies", "Allergies"],
  ["chronic_conditions", "Medical conditions"],
  ["current_medications", "Current medications"],
  ["dietary_restrictions", "Dietary restrictions"],
  ["disabilities", "Disabilities / support needs"],
  ["doctor_name", "Primary physician"],
  ["doctor_phone", "Physician phone"],
  ["emergency_contact_name", "Emergency contact name"],
  ["emergency_contact_phone", "Emergency contact phone"],
  ["emergency_contact_relation", "Emergency contact relation"],
  ["insurance_provider", "Insurance provider"],
  ["insurance_policy_no", "Insurance policy no."],
  ["notes", "Notes"],
];

/** SCR-217, live: GET /health/students/{id} (?id=) and PUT …/profile; without ?id= a search of /health/profiles. */
export function MedicalProfile() {
  const { id, rec } = useRecord();
  const router = useRouter();
  const editing = useSearchParams().get("edit") === "1";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!id) return <RecordPicker screen={217} />;
  if (rec.loading && !rec.data) return <Loading what="Loading the health record…" />;
  const r = rec.data;
  if (!r) return <ErrorNote>{rec.error ?? "Record not found."}</ErrorNote>;
  const p = r.profile;
  const close = () => router.replace(`${routeOf(217)}?id=${id}`);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api.put(`${HEALTH}/students/${id}/profile`, Object.fromEntries(PROFILE_FIELDS.map(([k]) => [k, formText(f, k)])));
      notify("Health profile saved.");
      close();
      rec.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const last = r.checkups[0];
  const followUps = r.visits.filter((v) => v.follow_up_on && v.follow_up_on >= today());
  const nextShots = r.immunizations.filter((m) => m.next_due_on && m.next_due_on >= today());
  return (
    <>
      <RecordBanner r={r} />
      <div className="two-col">
        <div className="stack">
          <Panel title="Medical information">
            <Kv
              rows={[
                ["Student", r.student_name],
                ["Blood group", p.blood_group ?? "—"],
                ["Medical conditions", p.chronic_conditions ?? "None recorded"],
                ["Primary physician", p.doctor_name ? `${p.doctor_name}${p.doctor_phone ? ` · ${p.doctor_phone}` : ""}` : "—"],
                ["Emergency contact", p.emergency_contact_name || p.emergency_contact_phone ? [p.emergency_contact_name, p.emergency_contact_relation, p.emergency_contact_phone].filter(Boolean).join(" · ") : "—"],
                ["Last check-up", last ? `${date(last.checked_on)}${last.height_cm ? ` · ${last.height_cm} cm` : ""}${last.weight_kg ? ` · ${last.weight_kg} kg` : ""}${last.bmi ? ` · BMI ${last.bmi}` : ""}` : "—"],
              ]}
            />
          </Panel>
          <Panel title="Recent clinic visits" flush>
            <DataTable
              columns={["Date", "Reason", "Action taken", "Recorded by"]}
              rows={r.visits.map((v) => [date(v.visited_at), v.complaint, [v.treatment, OUTCOMES[v.outcome]].filter(Boolean).join(" · "), v.recorded_by_name ?? "—"])}
              selectable={false}
              rowAction={false}
              empty="No clinic visits recorded."
            />
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Allergy alert">
            {p.allergies ? (
              <div className="tip warn">
                <Icon name="bell" className="sm" />
                <span>{`Allergy recorded: ${p.allergies}. Check before serving food or giving medicine.`}</span>
              </div>
            ) : (
              <p className="muted">No allergies recorded.</p>
            )}
            <Kv
              rows={[
                ["Allergies", p.allergies ?? "—"],
                ["Current medications", p.current_medications ?? "—"],
                ["Dietary restrictions", p.dietary_restrictions ?? "—"],
              ]}
            />
          </Panel>
          <Panel title="Follow-up">
            {followUps.map((v) => (
              <div className="timeline-item" key={`v${v.id}`}>
                <span className="timeline-dot">
                  <Icon name="heart" />
                </span>
                <div>
                  <h4>Clinic follow-up</h4>
                  <p>{v.complaint}</p>
                </div>
                <time>{date(v.follow_up_on).slice(0, 6)}</time>
              </div>
            ))}
            {nextShots.map((m) => (
              <div className="timeline-item" key={`i${m.id}`}>
                <span className="timeline-dot">
                  <Icon name="shield" />
                </span>
                <div>
                  <h4>{`${m.vaccine}${m.dose ? ` · ${m.dose}` : ""} due`}</h4>
                  <p>Immunisation</p>
                </div>
                <time>{date(m.next_due_on).slice(0, 6)}</time>
              </div>
            ))}
            {!followUps.length && !nextShots.length ? <p className="muted">Nothing scheduled.</p> : null}
            {p.updated_by_name ? <p className="muted small">{`Profile last updated by ${p.updated_by_name}.`}</p> : null}
          </Panel>
        </aside>
      </div>
      {editing ? (
        <Modal title={`Health profile · ${r.student_name}`} onClose={close} wide>
          <form onSubmit={save}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              {PROFILE_FIELDS.map(([k, t]) => (
                <Field key={k} label={t} full={k === "notes"}>
                  {k === "notes" ? <textarea name={k} defaultValue={p[k] ?? ""} /> : <input name={k} defaultValue={(p[k] as string | null) ?? ""} />}
                </Field>
              ))}
            </div>
            <p className="muted small">Blood group is kept on the student record, not here.</p>
            <ModalActions onClose={close} saving={saving} label="Save profile" />
          </form>
        </Modal>
      ) : null}
    </>
  );
}

/** Page-head "Update profile": opens the profile dialog for the student in ?id=. */
export function UpdateProfileLink() {
  const id = useSearchParams().get("id");
  if (!id) return null;
  return (
    <Link href={`${routeOf(217)}?id=${id}&edit=1`} className="btn primary">
      <Icon name="check" className="sm" />
      Update profile
    </Link>
  );
}

/** SCR-218, live: POST /health/visits (and the student's allergies from GET /health/students/{id}); a day's visits from GET /health/visits?on=, corrected with PATCH or removed with DELETE /health/visits/{id}. */
export function ClinicVisitForm() {
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const record = useApi<HealthRecord>(student ? `${HEALTH}/students/${student.id}` : null);
  const [day, setDay] = useState(today());
  const visits = useApi<Visit[]>(`${HEALTH}/visits`, { on: day });
  const [editing, setEditing] = useState<Visit | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!student) {
      setError("Choose a student.");
      return;
    }
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api.post(`${HEALTH}/visits`, {
        student_id: student.id,
        visited_at: new Date(`${f.get("day")}T${f.get("time")}`).toISOString(),
        complaint: formText(f, "complaint"),
        temperature_c: formText(f, "temperature_c"),
        treatment: formText(f, "treatment"),
        medicine_given: formText(f, "medicine_given"),
        outcome: formText(f, "outcome"),
        follow_up_on: formText(f, "follow_up_on"),
        notify_parent: f.get("notify_parent") === "on",
      });
      notify(`Clinic visit recorded for ${student.full_name}.`);
      setStudent(null);
      setFormKey((k) => k + 1);
      visits.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setEditError(null);
    try {
      await api.patch(`${HEALTH}/visits/${editing!.id}`, {
        complaint: formText(f, "complaint"),
        temperature_c: formText(f, "temperature_c"),
        treatment: formText(f, "treatment"),
        medicine_given: formText(f, "medicine_given"),
        outcome: formText(f, "outcome"),
        follow_up_on: formText(f, "follow_up_on"),
      });
      notify("Clinic visit corrected.");
      setEditing(null);
      visits.reload();
    } catch (err) {
      setEditError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeVisit(v: Visit) {
    if (!window.confirm(`Delete ${v.student_name}'s clinic visit of ${dateTime(v.visited_at)}? It is removed from their health record.`)) return;
    setEditError(null);
    try {
      await api.delete(`${HEALTH}/visits/${v.id}`);
      notify("Clinic visit deleted.");
      setEditing(null);
      visits.reload();
    } catch (err) {
      setEditError(errorText(err));
      setError(errorText(err));
    }
  }

  const now = new Date();
  const p = record.data?.profile;
  const dayVisits = visits.data ?? [];
  return (
    <>
      <div className="two-col">
        <form id="visit-form" className="panel" onSubmit={submit} key={formKey}>
          <div className="panel-pad">
            <ErrorNote>{error}</ErrorNote>
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Details</h3>
                </div>
                <div className="form-grid">
                  <StudentPicker value={student} onChange={setStudent} required />
                  <Field label="Visit date" required>
                    <input type="date" name="day" required defaultValue={today()} max={today()} />
                  </Field>
                  <Field label="Visit time" required>
                    <input type="time" name="time" required defaultValue={`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`} />
                  </Field>
                  <Field label="Reason" required>
                    <input name="complaint" required placeholder="What the student came in with" />
                  </Field>
                  <Field label="Temperature (°C)">
                    <input name="temperature_c" type="number" step="0.1" min={30} max={45} placeholder="e.g. 36.8" />
                  </Field>
                  <Field label="Outcome">
                    <select name="outcome" defaultValue="back_to_class">
                      {Object.entries(OUTCOMES).map(([k, t]) => (
                        <option key={k} value={k}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Action taken" full>
                    <textarea name="treatment" placeholder="Treatment and observations" />
                  </Field>
                  <Field label="Medicine given">
                    <input name="medicine_given" placeholder="Name and dose, if any" />
                  </Field>
                  <Field label="Follow-up on">
                    <input type="date" name="follow_up_on" min={today()} />
                  </Field>
                  <label className="field">
                    <span>Parent informed</span>
                    <span className="row">
                      <input type="checkbox" name="notify_parent" />
                      Notify the parent now
                    </span>
                  </label>
                </div>
              </section>
            </div>
          </div>
          <div className="form-footer">
            <span>Fields marked * are required</span>
            <div className="actions">
              <button type="submit" className="btn primary" disabled={saving}>
                <Icon name="check" className="sm" />
                {saving ? "Saving…" : "Save clinic visit"}
              </button>
            </div>
          </div>
        </form>
        <aside className="stack">
          <div className="aside-panel">
            <h3>Health & wellbeing</h3>
            {student ? (
              record.loading ? (
                <p>Checking the health record…</p>
              ) : record.error ? (
                <p>{record.error}</p>
              ) : (
                <>
                  {p?.allergies ? (
                    <div className="tip warn">
                      <Icon name="bell" className="sm" />
                      <span>{`Allergy: ${p.allergies}`}</span>
                    </div>
                  ) : null}
                  <Kv
                    rows={[
                      ["Allergies", p?.allergies ?? "None recorded"],
                      ["Conditions", p?.chronic_conditions ?? "None recorded"],
                      ["Medications", p?.current_medications ?? "None recorded"],
                    ]}
                  />
                  <div className="gap" />
                  <Link href={`${routeOf(217)}?id=${student.id}`} className="btn">
                    Open health record
                  </Link>
                </>
              )
            ) : (
              <p>Choose a student to check their allergies and conditions before treating.</p>
            )}
          </div>
        </aside>
      </div>
      <div className="gap" />
      <Panel
        title={day === today() ? "Today’s visits" : `Visits on ${date(day)}`}
        sub="Open a visit to correct or delete it"
        action={<input type="date" aria-label="Visits on" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())} />}
        flush
      >
        <DataTable
          columns={["Student", "Time", "Reason", "Outcome", "Recorded by"]}
          rows={dayVisits.map((v) => [{ name: v.student_name, sub: v.section_label ?? undefined }, dateTime(v.visited_at).split(", ")[1], v.complaint, OUTCOMES[v.outcome], v.recorded_by_name ?? "—"])}
          selectable={false}
          actions={(i) => (
            <>
              <button type="button" className="btn" onClick={() => (setEditError(null), setEditing(dayVisits[i]))}>
                Edit
              </button>
              <button type="button" className="btn" onClick={() => removeVisit(dayVisits[i])}>
                Delete
              </button>
            </>
          )}
          empty={visits.loading ? "Loading…" : day === today() ? "No visits recorded today." : "No visits recorded that day."}
        />
      </Panel>
      {editing ? (
        <Modal title={`${editing.student_name} · ${dateTime(editing.visited_at)}`} onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit}>
            <ErrorNote>{editError}</ErrorNote>
            <div className="form-grid">
              <Field label="Reason" required>
                <input name="complaint" required defaultValue={editing.complaint} />
              </Field>
              <Field label="Temperature (°C)">
                <input name="temperature_c" type="number" step="0.1" min={30} max={45} defaultValue={editing.temperature_c ?? ""} />
              </Field>
              <Field label="Outcome">
                <select name="outcome" defaultValue={editing.outcome}>
                  {Object.entries(OUTCOMES).map(([k, t]) => (
                    <option key={k} value={k}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Follow-up on">
                <input type="date" name="follow_up_on" defaultValue={editing.follow_up_on ?? ""} />
              </Field>
              <Field label="Action taken" full>
                <textarea name="treatment" defaultValue={editing.treatment ?? ""} />
              </Field>
              <Field label="Medicine given" full>
                <input name="medicine_given" defaultValue={editing.medicine_given ?? ""} />
              </Field>
            </div>
            <p className="muted small">{`The visit time and student cannot be changed. Parent ${editing.parent_notified ? "was" : "was not"} notified when it was recorded.`}</p>
            <div className="actions row">
              <button type="button" className="btn" onClick={() => removeVisit(editing)}>
                Delete visit
              </button>
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                <Icon name="check" className="sm" />
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

const AID_OUTCOMES: Record<string, string> = { returned_to_class: "Returned to class", rested_in_clinic: "Rested in clinic", sent_home: "Sent home", referred_out: "Referred out" };

/** SCR-219, live: GET/POST /wellbeing/medication, POST …/{id}/correct; GET/POST /wellbeing/first-aid. Append-only: a correction supersedes a dose. */
export function MedicationFirstAid() {
  const [from, setFrom] = useState(addDays(today(), -6));
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const doses = useApi<Dose[]>(`${WELL}/medication`, { from, to: today() });
  const aid = useApi<FirstAid[]>(`${WELL}/first-aid`, { from, to: today() });
  const [correcting, setCorrecting] = useState<Dose | null>(null);
  const [addingAid, setAddingAid] = useState(false);
  const [aidStudent, setAidStudent] = useState<PickedStudent | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  async function run(fn: () => Promise<unknown>, msg: string) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      notify(msg);
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function give(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!student) {
      setError("Choose a student.");
      return;
    }
    const f = new FormData(e.currentTarget);
    const ok = await run(
      () => api.post(`${WELL}/medication`, { student_id: student.id, given_on: formText(f, "given_on"), given_at: formText(f, "given_at"), medicine: formText(f, "medicine"), dose: formText(f, "dose"), reason: formText(f, "reason"), parent_informed: f.get("parent_informed") === "on", notes: formText(f, "notes") }),
      "Dose recorded.",
    );
    if (ok) {
      setStudent(null);
      setFormKey((k) => k + 1);
      doses.reload();
    }
  }

  async function correct(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await run(
      () => api.post(`${WELL}/medication/${correcting!.id}/correct`, { given_on: formText(f, "given_on"), given_at: formText(f, "given_at"), medicine: formText(f, "medicine"), dose: formText(f, "dose"), correction_reason: formText(f, "correction_reason"), reason: formText(f, "reason"), notes: formText(f, "notes") }),
      "Correction recorded; the earlier entry is kept and marked superseded.",
    );
    if (ok) {
      setCorrecting(null);
      doses.reload();
    }
  }

  async function logAid(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const outcome = formText(f, "outcome");
    // The API needs to know who was hurt; this form records children.
    if (!aidStudent) {
      setError("Choose the child who was hurt.");
      return;
    }
    const ok = await run(
      () =>
        api.post(`${WELL}/first-aid`, {
          student_id: aidStudent?.id ?? null,
          happened_on: formText(f, "happened_on"),
          happened_at: formText(f, "happened_at"),
          place: formText(f, "place"),
          what_happened: formText(f, "what_happened"),
          treatment: formText(f, "treatment"),
          outcome,
          sent_home: outcome === "sent_home",
          parent_informed: f.get("parent_informed") === "on",
          referred_to: formText(f, "referred_to"),
        }),
      "First aid recorded.",
    );
    if (ok) {
      setAddingAid(false);
      setAidStudent(null);
      aid.reload();
    }
  }

  const list = doses.data ?? [];
  return (
    <>
      <div className="two-col">
        <form id="dose-form" className="panel" onSubmit={give} key={formKey}>
          <div className="panel-pad">
            <ErrorNote>{!correcting && !addingAid ? error : null}</ErrorNote>
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Medication given</h3>
                </div>
                <div className="form-grid">
                  <StudentPicker value={student} onChange={setStudent} required />
                  <Field label="Medication" required>
                    <input name="medicine" required />
                  </Field>
                  <Field label="Dosage" required>
                    <input name="dose" required placeholder="e.g. 5 ml" />
                  </Field>
                  <Field label="Given on" required>
                    <input type="date" name="given_on" required defaultValue={today()} max={today()} />
                  </Field>
                  <Field label="Administered at" required>
                    <input type="time" name="given_at" required defaultValue={hhmm} />
                  </Field>
                  <Field label="Reason">
                    <input name="reason" placeholder="e.g. As prescribed, after lunch" />
                  </Field>
                  <Field label="Notes" full>
                    <input name="notes" />
                  </Field>
                  <label className="field">
                    <span>Parent informed</span>
                    <span className="row">
                      <input type="checkbox" name="parent_informed" />
                      Yes
                    </span>
                  </label>
                </div>
                {/* Not wired: prescribed by, staff member and consent reference — the API records the signed-in user as the giver and has no prescription or consent fields. */}
              </section>
            </div>
          </div>
          <div className="form-footer">
            <span>Entries cannot be edited; a mistake is corrected by a new entry that supersedes it.</span>
            <div className="actions">
              <button type="submit" className="btn primary" disabled={saving}>
                <Icon name="check" className="sm" />
                Record administration
              </button>
            </div>
          </div>
        </form>
        <aside className="stack">
          <div className="aside-panel">
            <h3>Health & wellbeing</h3>
            <Kv
              rows={[
                ["Doses in range", doses.data ? String(list.filter((d) => !d.is_superseded).length) : "…"],
                ["First aid in range", aid.data ? String(aid.data.length) : "…"],
                ["Sent home", aid.data ? String(aid.data.filter((a) => a.sent_home).length) : "…"],
              ]}
            />
            <div className="gap" />
            <Field label="Show from">
              <input type="date" value={from} max={today()} onChange={(e) => setFrom(e.target.value || addDays(today(), -6))} />
            </Field>
          </div>
        </aside>
      </div>
      <div className="gap" />
      <Panel title="Medication log" sub={`${date(from)} – ${date(today())}`} flush>
        <DataTable
          columns={["Student", "Medication", "Dosage", "Given", "Given by", "Status"]}
          rows={list.map((d) => [{ name: d.student_name ?? `Student #${d.student_id}`, sub: d.section_label ?? undefined }, d.medicine, d.dose, `${date(d.given_on)} ${time12(d.given_at)}`, d.given_by ?? "—", d.is_superseded ? "Superseded" : d.corrects_id ? "Correction" : "Recorded"])}
          selectable={false}
          onView={(i) => (list[i].is_superseded ? notify(`Superseded${list[i].correction_reason ? `: ${list[i].correction_reason}` : ""}.`) : setCorrecting(list[i]))}
          empty={doses.loading ? "Loading…" : doses.error ?? "No medication given in this period."}
        />
      </Panel>
      <div className="gap" />
      <Panel title="First aid" action={<button type="button" className="btn" onClick={() => setAddingAid(true)}><Icon name="plus" className="sm" />Record first aid</button>} flush>
        <DataTable
          columns={["Student", "When", "Place", "What happened", "Treatment", "Outcome"]}
          rows={(aid.data ?? []).map((a) => [{ name: a.student_name ?? a.staff_name ?? "—", sub: a.section_label ?? undefined }, `${date(a.happened_on)} ${time12(a.happened_at)}`, a.place ?? "—", a.what_happened, a.treatment, AID_OUTCOMES[a.outcome] ?? label(a.outcome)])}
          selectable={false}
          rowAction={false}
          empty={aid.loading ? "Loading…" : aid.error ?? "No first aid recorded in this period."}
        />
      </Panel>
      {correcting ? (
        <Modal title={`Correct: ${correcting.medicine} · ${correcting.student_name ?? ""}`} onClose={() => setCorrecting(null)}>
          <form onSubmit={correct}>
            <ErrorNote>{error}</ErrorNote>
            <p className="muted small">The original entry stays on record, marked as superseded by this one.</p>
            <div className="form-grid">
              <Field label="Medication" required>
                <input name="medicine" required defaultValue={correcting.medicine} />
              </Field>
              <Field label="Dosage" required>
                <input name="dose" required defaultValue={correcting.dose} />
              </Field>
              <Field label="Given on" required>
                <input type="date" name="given_on" required defaultValue={correcting.given_on} />
              </Field>
              <Field label="Administered at" required>
                <input type="time" name="given_at" required defaultValue={correcting.given_at.slice(0, 5)} />
              </Field>
              <Field label="Reason">
                <input name="reason" defaultValue={correcting.reason ?? ""} />
              </Field>
              <Field label="Notes">
                <input name="notes" defaultValue={correcting.notes ?? ""} />
              </Field>
              <Field label="Why it is being corrected" required full>
                <input name="correction_reason" required />
              </Field>
            </div>
            <ModalActions onClose={() => setCorrecting(null)} saving={saving} label="Record correction" />
          </form>
        </Modal>
      ) : null}
      {addingAid ? (
        <Modal title="Record first aid" onClose={() => setAddingAid(false)} wide>
          <form onSubmit={logAid}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <StudentPicker value={aidStudent} onChange={setAidStudent} required />
              <Field label="Place">
                <input name="place" placeholder="e.g. Playground" />
              </Field>
              <Field label="Date" required>
                <input type="date" name="happened_on" required defaultValue={today()} max={today()} />
              </Field>
              <Field label="Time" required>
                <input type="time" name="happened_at" required defaultValue={hhmm} />
              </Field>
              <Field label="What happened" required full>
                <textarea name="what_happened" required />
              </Field>
              <Field label="Treatment" required full>
                <textarea name="treatment" required />
              </Field>
              <Field label="Outcome">
                <select name="outcome" defaultValue="returned_to_class">
                  {Object.entries(AID_OUTCOMES).map(([k, t]) => (
                    <option key={k} value={k}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Referred to">
                <input name="referred_to" />
              </Field>
              <label className="field">
                <span>Parent informed</span>
                <span className="row">
                  <input type="checkbox" name="parent_informed" />
                  Yes
                </span>
              </label>
            </div>
            <ModalActions onClose={() => setAddingAid(false)} saving={saving} label="Record first aid" />
          </form>
        </Modal>
      ) : null}
    </>
  );
}

type SchoolClass = { id: number; name: string; sections: { id: number; name: string }[] };

/** SCR-220, live: per student GET /health/students/{id}, POST …/immunizations, DELETE /health/immunizations/{id}; overview from /health/immunizations-due, /health/alerts; class drives POST /wellbeing/immunisation/bulk. */
export function ImmunizationAllergy() {
  const router = useRouter();
  const { id, rec } = useRecord();
  const adding = useSearchParams().get("new") === "1";
  const due = useApi<Due[]>(id ? null : `${HEALTH}/immunizations-due`, { within_days: 60 });
  const alerts = useApi<Alert[]>(id ? null : `${HEALTH}/alerts`);
  const years = useApi<{ id: number; is_current: boolean }[]>(id ? null : "/api/v1/school/academic-years");
  const yearId = (years.data?.find((y) => y.is_current) ?? years.data?.[0])?.id;
  const classes = useApi<SchoolClass[]>(!id && yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const [picked, setPicked] = useState<PickedStudent | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drive, setDrive] = useState<string | null>(null);
  const [shot, setShot] = useState<number | null>(null);
  const close = () => router.replace(id ? `${routeOf(220)}?id=${id}` : routeOf(220));

  async function run(fn: () => Promise<unknown>, msg: string) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      notify(msg);
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addShot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (await run(() => api.post(`${HEALTH}/students/${id}/immunizations`, { vaccine: formText(f, "vaccine"), dose: formText(f, "dose"), given_on: formText(f, "given_on"), next_due_on: formText(f, "next_due_on"), notes: formText(f, "notes") }), "Immunisation recorded.")) {
      close();
      rec.reload();
    }
  }

  async function runDrive(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<{ recorded: unknown[]; skipped: unknown[]; already_had_it: unknown[] }>(`${WELL}/immunisation/bulk`, { section_id: Number(f.get("section_id")), vaccine: formText(f, "vaccine"), given_on: formText(f, "given_on"), dose: formText(f, "dose"), next_due_on: formText(f, "next_due_on"), skip_student_ids: [] });
      setDrive(`Recorded for ${r.recorded.length} student(s); ${r.already_had_it.length} already had it; ${r.skipped.length} skipped.`);
      notify("Drive recorded.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  if (!id) {
    return (
      <>
        <div className="filterbar">
          <div style={{ minWidth: 320 }}>
            <StudentPicker label="Open a student's record" value={picked} onChange={(s) => s && router.push(`${routeOf(220)}?id=${s.id}`)} />
          </div>
        </div>
        <ErrorNote>{due.error ?? alerts.error}</ErrorNote>
        <div className="two-col">
          <div className="stack">
            <Panel title="Immunisations due" sub="Next 60 days" flush>
              <DataTable
                columns={["Student", "Class", "Vaccine", "Due on"]}
                rows={(due.data ?? []).map((x) => [{ name: x.student_name ?? x.full_name ?? "—", sub: x.admission_no ?? undefined }, x.section_label ?? "—", x.vaccine, date(x.next_due_on)])}
                selectable={false}
                onView={(i) => router.push(`${routeOf(220)}?id=${due.data![i].student_id}`)}
                empty={due.loading ? "Loading…" : "Nothing due in the next 60 days."}
              />
            </Panel>
            <Panel title="Allergy & condition alerts" flush>
              <DataTable
                columns={["Student", "Class", "Allergies", "Conditions", "Medications"]}
                rows={(alerts.data ?? []).map((a) => [a.student_name, a.section_label ?? "—", a.allergies ?? "—", a.chronic_conditions ?? "—", a.current_medications ?? "—"])}
                selectable={false}
                onView={(i) => router.push(`${routeOf(220)}?id=${alerts.data![i].student_id}`)}
                empty={alerts.loading ? "Loading…" : "No allergies or conditions recorded."}
              />
            </Panel>
          </div>
          <aside className="stack">
            <form className="panel" onSubmit={runDrive}>
              <div className="panel-head">
                <div>
                  <h2>Record a class drive</h2>
                  <p>One vaccine for a whole section</p>
                </div>
              </div>
              <div className="panel-body">
                <ErrorNote>{error}</ErrorNote>
                {drive ? <p>{drive}</p> : null}
                <div className="form-grid">
                  <Field label="Section" required full>
                    <select name="section_id" required>
                      <option value="">Select section</option>
                      {classes.data?.map((c) =>
                        c.sections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {`${c.name} ${s.name}`}
                          </option>
                        )),
                      )}
                    </select>
                  </Field>
                  <Field label="Vaccine" required full>
                    <input name="vaccine" required />
                  </Field>
                  <Field label="Given on" required>
                    <input type="date" name="given_on" required defaultValue={today()} />
                  </Field>
                  <Field label="Dose">
                    <input name="dose" />
                  </Field>
                  <Field label="Next due on">
                    <input type="date" name="next_due_on" />
                  </Field>
                </div>
                <div className="gap" />
                <button type="submit" className="btn primary" disabled={saving}>
                  Record drive
                </button>
              </div>
            </form>
          </aside>
        </div>
      </>
    );
  }

  if (rec.loading && !rec.data) return <Loading what="Loading the health record…" />;
  const r = rec.data;
  if (!r) return <ErrorNote>{rec.error ?? "Record not found."}</ErrorNote>;
  const p = r.profile;

  async function remove(immId: number) {
    if (!window.confirm("Delete this immunisation entry?")) return;
    if (await run(() => api.delete(`${HEALTH}/immunizations/${immId}`), "Entry deleted.")) {
      setShot(null);
      rec.reload();
    }
  }
  const open = r.immunizations.find((m) => m.id === shot);

  return (
    <>
      <RecordBanner r={r} />
      <ErrorNote>{!adding ? error : null}</ErrorNote>
      <div className="two-col">
        <div className="stack">
          <Panel title="Medical information">
            <Kv
              rows={[
                ["Student", r.student_name],
                ["Blood group", p.blood_group ?? "—"],
                ["Medical conditions", p.chronic_conditions ?? "None recorded"],
                ["Primary physician", p.doctor_name ?? "—"],
                ["Emergency contact", [p.emergency_contact_name, p.emergency_contact_phone].filter(Boolean).join(" · ") || "—"],
                ["Last immunisation", r.immunizations[0] ? `${r.immunizations[0].vaccine} · ${date(r.immunizations[0].given_on)}` : "—"],
              ]}
            />
          </Panel>
          <Panel title="Immunisations" flush>
            <DataTable
              columns={["Vaccine", "Dose", "Given on", "Next due", "Notes"]}
              rows={r.immunizations.map((m) => [m.vaccine, m.dose ?? "—", date(m.given_on), date(m.next_due_on), m.notes ?? "—"])}
              selectable={false}
              onView={(i) => setShot(r.immunizations[i].id)}
              empty="No immunisations recorded."
            />
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Allergy alert">
            {p.allergies ? (
              <div className="tip warn">
                <Icon name="bell" className="sm" />
                <span>{`Allergy recorded: ${p.allergies}.`}</span>
              </div>
            ) : (
              <p className="muted">No allergies recorded.</p>
            )}
            <Kv
              rows={[
                ["Allergies", p.allergies ?? "—"],
                ["Dietary restrictions", p.dietary_restrictions ?? "—"],
                ["Current medications", p.current_medications ?? "—"],
              ]}
            />
            <div className="gap" />
            <Link href={`${routeOf(217)}?id=${r.student_id}&edit=1`} className="btn">
              Edit allergies in the profile
            </Link>
          </Panel>
          <Panel title="Next action">
            <p className="muted small">Record new doses with Add record; open an entry to see or delete it.</p>
            <div className="gap" />
            <Link href={routeOf(220)} className="btn">
              <Icon name="arrow" className="sm" />
              All students
            </Link>
          </Panel>
        </aside>
      </div>
      {open ? (
        <Modal title={`${open.vaccine}${open.dose ? ` · ${open.dose}` : ""}`} onClose={() => setShot(null)}>
          <ErrorNote>{error}</ErrorNote>
          <Kv rows={[["Given on", date(open.given_on)], ["Next due", date(open.next_due_on)], ["Notes", open.notes ?? "—"]]} />
          <div className="actions row">
            <button type="button" className="btn" disabled={saving} onClick={() => remove(open.id)}>
              Delete entry
            </button>
            <button type="button" className="btn primary" onClick={() => setShot(null)}>
              Close
            </button>
          </div>
        </Modal>
      ) : null}
      {adding ? (
        <Modal title={`Add immunisation · ${r.student_name}`} onClose={close}>
          <form onSubmit={addShot}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <Field label="Vaccine" required>
                <input name="vaccine" required />
              </Field>
              <Field label="Dose">
                <input name="dose" placeholder="e.g. Booster" />
              </Field>
              <Field label="Given on">
                <input type="date" name="given_on" defaultValue={today()} />
              </Field>
              <Field label="Next due on">
                <input type="date" name="next_due_on" />
              </Field>
              <Field label="Notes" full>
                <input name="notes" />
              </Field>
            </div>
            <ModalActions onClose={close} saving={saving} label="Add record" />
          </form>
        </Modal>
      ) : null}
    </>
  );
}

/** Page-head "Add record" on SCR-220: needs a student chosen first. */
export function AddImmunizationLink() {
  const id = useSearchParams().get("id");
  if (!id) return null;
  return (
    <Link href={`${routeOf(220)}?id=${id}&new=1`} className="btn primary">
      <Icon name="plus" className="sm" />
      Add record
    </Link>
  );
}

