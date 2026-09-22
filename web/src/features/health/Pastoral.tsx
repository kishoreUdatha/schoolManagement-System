"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, Kv, Modal, ModalActions, SearchBox, StudentPicker, formNum, formText, time12, today, type PickedStudent } from "@/features/transport/kit";
import { WELL } from "./Clinic";
import type { Appointment, Chain, CounsellingCase, Incident, IncidentStatus, OutstandingAction, StaffOption, Thin } from "./types";

const DISC = "/api/v1/school/discipline";
const STAFF = "/api/v1/school/directory/staff";

/** ?new=1 opens a page's "add" dialog; the page-head button links to it. */
function useAddDialog(screen: number) {
  const router = useRouter();
  const params = useSearchParams();
  const open = params.get("new") === "1";
  const id = params.get("id");
  return { open, close: () => router.replace(id ? `${routeOf(screen)}?id=${id}` : routeOf(screen)) };
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TONES = ["", "mint", "peach"];

/** SCR-221, live: GET/POST /wellbeing/counselling/appointments, PATCH …/{id}; the counsellor's private note only through GET …/{id}/private-note on request. */
export function CounsellingCalendar() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [counsellor, setCounsellor] = useState("");
  const [status, setStatus] = useState("");
  const first = iso(month);
  const last = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const appts = useApi<Appointment[]>(`${WELL}/counselling/appointments`, { from: first, to: last, counsellor_user_id: counsellor });
  const staff = useApi<StaffOption[]>(STAFF);
  const add = useAddDialog(221);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [open, setOpen] = useState<Appointment | null>(null);
  const [ownNote, setOwnNote] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Monday-first grid covering the month.
  const lead = (month.getDay() + 6) % 7;
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - lead);
  const cells = Array.from({ length: Math.ceil((lead + Number(last.slice(8))) / 7) * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const items = (appts.data ?? []).filter((a) => !status || a.status === status);
  const byDay = new Map<string, Appointment[]>();
  items.forEach((a) => byDay.set(a.scheduled_on, [...(byDay.get(a.scheduled_on) ?? []), a]));
  const todayIso = today();

  const close = () => {
    setError(null);
    setStudent(null);
    setOpen(null);
    setOwnNote(null);
    setNoteError(null);
    if (add.open) add.close();
  };

  async function book(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      if (!student) throw new Error("Choose a student.");
      await api.post(`${WELL}/counselling/appointments`, { student_id: student.id, scheduled_on: formText(f, "scheduled_on"), scheduled_at: formText(f, "scheduled_at"), duration_minutes: formNum(f, "duration_minutes") ?? 30, counsellor_user_id: formNum(f, "counsellor_user_id"), notes: formText(f, "notes") });
      notify("Appointment booked.");
      close();
      appts.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function openPrivate() {
    if (!open) return;
    setNoteError(null);
    try {
      const r = await api.get<{ private_notes: string | null }>(`${WELL}/counselling/appointments/${open.id}/private-note`);
      setOwnNote(r.private_notes ?? "");
    } catch (err) {
      setNoteError(errorText(err));
    }
  }

  async function update(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api.patch(`${WELL}/counselling/appointments/${open!.id}`, {
        status: formText(f, "status"),
        notes: formText(f, "notes"),
        // Only sent when the counsellor opened their own note, so a blank box never wipes it.
        ...(ownNote !== null ? { private_notes: formText(f, "private_notes") } : {}),
      });
      notify("Appointment updated.");
      close();
      appts.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="filterbar">
        <select aria-label="Filter by counsellor" value={counsellor} onChange={(e) => setCounsellor(e.target.value)}>
          <option value="">All counsellors</option>
          {staff.data?.map((s) => (
            <option key={s.user_id} value={s.user_id}>
              {s.full_name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="booked">Booked</option>
          <option value="attended">Attended</option>
          <option value="missed">Missed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button type="button" className="btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          ‹ Previous
        </button>
        <button type="button" className="btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          Next ›
        </button>
      </div>
      <ErrorNote>{!add.open && !open ? (error ?? appts.error) : null}</ErrorNote>
      <Panel
        title={`${MONTH_NAMES[month.getMonth()]} ${month.getFullYear()}`}
        sub={`${items.length} appointment(s) · session notes stay with the counsellor`}
        action={
          <button type="button" className="btn" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
            Today
          </button>
        }
        flush
      >
        <div className="table-wrap">
          <div className="calendar-grid">
            {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
              <div className="day-head" key={d}>
                {d}
              </div>
            ))}
            {cells.map((c) => {
              const k = iso(c);
              return (
                <div className={`calendar-day ${c.getMonth() !== month.getMonth() ? "outside" : ""}`} key={k} style={k === todayIso ? { outline: "2px solid #2563eb", outlineOffset: -2 } : undefined}>
                  <strong>{c.getDate()}</strong>
                  {(byDay.get(k) ?? []).map((a, i) => (
                    <button key={a.id} type="button" className={`cal-event ${TONES[i % 3]}`} onClick={() => setOpen(a)}>
                      {`${a.student_name ?? "Student"} · ${label(a.status)}`}
                      <br />
                      {time12(a.scheduled_at)}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
      {add.open ? (
        <Modal title="Book appointment" onClose={close}>
          <form onSubmit={book}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <StudentPicker value={student} onChange={setStudent} required />
              <Field label="Counsellor">
                <select name="counsellor_user_id">
                  <option value="">Me</option>
                  {staff.data?.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date" required>
                <input type="date" name="scheduled_on" required defaultValue={today()} min={today()} />
              </Field>
              <Field label="Time" required>
                <input type="time" name="scheduled_at" required defaultValue="10:00" />
              </Field>
              <Field label="Duration (minutes)">
                <input type="number" name="duration_minutes" min={5} max={240} defaultValue={30} />
              </Field>
              <Field label="Booking note" full>
                <input name="notes" placeholder="Visible to staff who can see the diary — keep private detail out" />
              </Field>
            </div>
            <ModalActions onClose={close} saving={saving} label="Book appointment" />
          </form>
        </Modal>
      ) : null}
      {open ? (
        <Modal title={`${open.student_name ?? "Student"} · ${date(open.scheduled_on)} ${time12(open.scheduled_at)}`} onClose={close}>
          <form onSubmit={update}>
            <ErrorNote>{error}</ErrorNote>
            <Kv
              rows={[
                ["Counsellor", open.counsellor_name ?? "—"],
                ["Duration", `${open.duration_minutes} min`],
                ["Class", open.section_label ?? "—"],
              ]}
            />
            <div className="form-grid">
              <Field label="Status">
                <select name="status" defaultValue={open.status}>
                  <option value="booked">Booked</option>
                  <option value="attended">Attended</option>
                  <option value="missed">Missed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </Field>
              <Field label="Booking note" full>
                <input name="notes" defaultValue={open.notes ?? ""} />
              </Field>
              {ownNote !== null ? (
                <Field label="My private note" full>
                  <textarea name="private_notes" defaultValue={ownNote} rows={4} />
                </Field>
              ) : null}
            </div>
            {ownNote === null ? (
              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn" onClick={openPrivate}>
                  Open my private note
                </button>
                {noteError ? <span className="muted small">{noteError}</span> : <span className="muted small">Only the counsellor who wrote it can open it.</span>}
              </div>
            ) : null}
            <ModalActions onClose={close} saving={saving} label="Save" />
          </form>
        </Modal>
      ) : null}
    </>
  );
}

const CASE_CATEGORIES = ["academic", "behaviour", "emotional", "family", "bullying", "peer_relations", "career", "health", "other"];

/** SCR-222, live: GET/POST /discipline/counselling/cases, GET/PATCH …/{id}, POST …/{id}/sessions, POST …/{id}/inform-parents. Only what the API returns for this role is shown. */
export function CaseNotes() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const add = useAddDialog(222);
  const [status, setStatus] = useState("");
  const cases = useApi<CounsellingCase[]>(`${DISC}/counselling/cases`, { status });
  const one = useApi<CounsellingCase>(id ? `${DISC}/counselling/cases/${id}` : null);
  const staff = useApi<StaffOption[]>(STAFF);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const c = one.data;

  async function run(fn: () => Promise<unknown>, msg: string) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      notify(msg);
      one.reload();
      cases.reload();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function session(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!c) {
      setError("Choose a case first.");
      return;
    }
    const f = new FormData(e.currentTarget);
    if (await run(() => api.post(`${DISC}/counselling/cases/${c.id}/sessions`, { met_on: formText(f, "met_on"), minutes: formNum(f, "minutes"), attendees: formText(f, "attendees"), notes: formText(f, "notes"), support_plan: formText(f, "support_plan"), next_session_on: formText(f, "next_session_on") }), "Session note saved.")) setFormKey((k) => k + 1);
  }

  async function openCase(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      if (!student) throw new Error("Choose a student.");
      const r = await api.post<CounsellingCase>(`${DISC}/counselling/cases`, { student_id: student.id, title: formText(f, "title"), category: formText(f, "category"), concern: formText(f, "concern"), priority: formText(f, "priority"), is_sensitive: f.get("is_sensitive") === "on", counsellor_user_id: formNum(f, "counsellor_user_id") });
      notify(`Case ${r.reference_no} opened.`);
      setStudent(null);
      router.replace(`${routeOf(222)}?id=${r.id}`);
      cases.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function closeCase(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (await run(() => api.patch(`${DISC}/counselling/cases/${c!.id}`, { status: formText(f, "status"), outcome: formText(f, "outcome"), referred_to: formText(f, "referred_to") }), "Case updated.")) setClosing(false);
  }

  async function inform() {
    const message = window.prompt("Message to the parents (a summary only — session notes are never shared):");
    if (message && message.trim()) await run(() => api.post(`${DISC}/counselling/cases/${c!.id}/inform-parents`, { message: message.trim() }), "Parents informed.");
  }

  const list = cases.data ?? [];
  const writable = c ? c.can_write !== false && c.status !== "closed" : false;
  return (
    <>
      <div className="filterbar">
        <select aria-label="Case" value={id ?? ""} onChange={(e) => router.replace(e.target.value ? `${routeOf(222)}?id=${e.target.value}` : routeOf(222))}>
          <option value="">{cases.loading ? "Loading cases…" : list.length ? "Choose a case" : "No cases you can see"}</option>
          {list.map((x) => (
            <option key={x.id} value={x.id}>
              {`${x.reference_no} · ${x.student_name} · ${x.title}`}
            </option>
          ))}
        </select>
        <select aria-label="Filter cases by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="referred">Referred</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>Cases are private: only the assigned counsellor, the principal and the school admin can read them. This screen shows only what the school’s records allow you to see.</span>
      </div>
      <ErrorNote>{!add.open && !closing ? (error ?? cases.error ?? one.error) : null}</ErrorNote>
      <div className="two-col">
        <form id="session-form" className="panel" onSubmit={session} key={`${c?.id}-${formKey}`}>
          <div className="panel-pad">
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Session note</h3>
                </div>
                <div className="form-grid">
                  <Field label="Student">
                    <input value={c?.student_name ?? ""} readOnly placeholder="Choose a case above" />
                  </Field>
                  <Field label="Case number">
                    <input value={c?.reference_no ?? ""} readOnly />
                  </Field>
                  <Field label="Session date" required>
                    <input type="date" name="met_on" required defaultValue={today()} max={today()} disabled={!writable} />
                  </Field>
                  <Field label="Counsellor">
                    <input value={c?.counsellor_name ?? ""} readOnly />
                  </Field>
                  <Field label="Observation" required full>
                    <textarea name="notes" required disabled={!writable} placeholder={writable ? "What was discussed and observed" : c ? "You cannot add notes to this case" : ""} />
                  </Field>
                  <Field label="Support plan" full>
                    <textarea name="support_plan" maxLength={10000} disabled={!writable} placeholder={writable ? "What was agreed: actions, who does them, by when" : ""} />
                  </Field>
                  <Field label="Minutes">
                    <input type="number" name="minutes" min={1} max={600} disabled={!writable} />
                  </Field>
                  <Field label="Attendees">
                    <input name="attendees" disabled={!writable} placeholder="Who was present" />
                  </Field>
                  <Field label="Next session">
                    <input type="date" name="next_session_on" min={today()} disabled={!writable} />
                  </Field>
                  <Field label="Visibility">
                    <input value={c ? (c.is_sensitive ? "Sensitive: assigned counsellor and principal" : "Counsellor, principal and school admin") : ""} readOnly />
                  </Field>
                </div>
              </section>
            </div>
          </div>
          <div className="form-footer">
            <span>Fields marked * are required</span>
            <div className="actions">
              <button type="submit" className="btn primary" disabled={saving || !writable}>
                <Icon name="check" className="sm" />
                Save case note
              </button>
            </div>
          </div>
        </form>
        <aside className="stack">
          <div className="aside-panel">
            <h3>{c ? `${c.reference_no} · ${c.title}` : "Case"}</h3>
            {c ? (
              <>
                <Kv
                  rows={[
                    ["Student", `${c.student_name}${c.section_label ? ` · ${c.section_label}` : ""}`],
                    ["Category", label(c.category)],
                    ["Priority", label(c.priority)],
                    ["Status", label(c.status)],
                    ["Opened", `${date(c.opened_on)}${c.referred_by_name ? ` by ${c.referred_by_name}` : ""}`],
                    ["Parents informed", c.parent_informed ? "Yes" : "No"],
                    ["Sessions", String(c.session_count)],
                  ]}
                />
                <div className="gap" />
                <p>{c.concern}</p>
                {c.outcome ? <p className="muted small">{`Outcome: ${c.outcome}`}</p> : null}
                <div className="gap" />
                {c.can_write !== false ? (
                  <div className="row">
                    <button type="button" className="btn" onClick={() => setClosing(true)}>
                      Update status
                    </button>
                    <button type="button" className="btn" onClick={inform} disabled={saving}>
                      Inform parents
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p>{one.loading ? "Loading the case…" : "Choose a case to record a session, or open a new case."}</p>
            )}
          </div>
          {c?.sessions?.length ? (
            <Panel title="Sessions">
              {c.sessions.map((s) => (
                <div className="timeline-item" key={s.id}>
                  <span className="timeline-dot">
                    <Icon name="file" />
                  </span>
                  <div>
                    <h4>{`${date(s.met_on)}${s.minutes ? ` · ${s.minutes} min` : ""}`}</h4>
                    <p>{s.notes}</p>
                    {s.support_plan ? <p className="small">{`Support plan: ${s.support_plan}`}</p> : null}
                    <p className="muted small">{[s.recorded_by_name, s.next_session_on ? `next ${date(s.next_session_on)}` : null].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
              ))}
            </Panel>
          ) : null}
        </aside>
      </div>
      {add.open ? (
        <Modal title="Open a counselling case" onClose={add.close}>
          <form onSubmit={openCase}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <StudentPicker value={student} onChange={setStudent} required />
              <Field label="Title" required>
                <input name="title" required />
              </Field>
              <Field label="Category">
                <select name="category" defaultValue="other">
                  {CASE_CATEGORIES.map((k) => (
                    <option key={k} value={k}>
                      {label(k)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select name="priority" defaultValue="medium">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </Field>
              <Field label="Counsellor">
                <select name="counsellor_user_id">
                  <option value="">Unassigned</option>
                  {staff.data?.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="field">
                <span>Sensitive</span>
                <span className="row">
                  <input type="checkbox" name="is_sensitive" />
                  Counsellor and principal only
                </span>
              </label>
              <Field label="Concern" required full>
                <textarea name="concern" required />
              </Field>
            </div>
            <ModalActions onClose={add.close} saving={saving} label="Open case" />
          </form>
        </Modal>
      ) : null}
      {closing && c ? (
        <Modal title={`Update ${c.reference_no}`} onClose={() => setClosing(false)}>
          <form onSubmit={closeCase}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <Field label="Status">
                <select name="status" defaultValue={c.status}>
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="referred">Referred</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
              <Field label="Referred to">
                <input name="referred_to" defaultValue={c.referred_to ?? ""} />
              </Field>
              <Field label="Outcome" full>
                <textarea name="outcome" defaultValue={c.outcome ?? ""} />
              </Field>
            </div>
            <ModalActions onClose={() => setClosing(false)} saving={saving} label="Save" />
          </form>
        </Modal>
      ) : null}
    </>
  );
}

export const INCIDENT_CATEGORIES = ["bullying", "fighting", "cheating", "disrespect", "property_damage", "phone_misuse", "uniform", "late_or_absent", "unsafe_behaviour", "other"];
const INCIDENT_STATUS: Record<IncidentStatus, string> = { reported: "Reported", investigating: "Under review", action_taken: "Action taken", closed: "Closed", dismissed: "Dismissed" };

/** SCR-223, live: GET/POST /discipline/incidents (status filter). */
export function IncidentList() {
  const router = useRouter();
  const add = useAddDialog(223);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const incidents = useApi<Incident[]>(`${DISC}/incidents`, { status });
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const all = incidents.data ?? [];
  const items = all.filter((i) => (!category || i.category === category) && (!search.trim() || `${i.student_name} ${i.reference_no} ${i.description}`.toLowerCase().includes(search.trim().toLowerCase())));
  const rows: Row[] = items.map((i) => [{ name: i.student_name, sub: i.reference_no }, i.section_label ?? "—", `${label(i.category)} · ${label(i.severity)}`, date(i.occurred_on), i.reported_by_name ?? "—", INCIDENT_STATUS[i.status]]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      if (!student) throw new Error("Choose a student.");
      const r = await api.post<Incident>(`${DISC}/incidents`, { student_id: student.id, occurred_on: formText(f, "occurred_on"), place: formText(f, "place"), category: formText(f, "category"), severity: formText(f, "severity"), description: formText(f, "description"), witnesses: formText(f, "witnesses") });
      notify(`Incident ${r.reference_no} recorded.`);
      setStudent(null);
      router.push(`${routeOf(224)}?id=${r.id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="filterbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search behaviour / discipline incidents…" />
        <select aria-label="Filter by type" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All incident types</option>
          {INCIDENT_CATEGORIES.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(INCIDENT_STATUS).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{!add.open ? (error ?? incidents.error) : null}</ErrorNote>
      <Panel title="Incidents" sub={incidents.data ? `${all.filter((i) => i.status === "reported" || i.status === "investigating").length} open · ${all.length} listed` : "Loading…"} flush>
        <DataTable
          columns={["Student", "Class", "Incident type", "Date", "Recorded by", "Status"]}
          rows={rows}
          onView={(i) => router.push(`${routeOf(224)}?id=${items[i].id}`)}
          empty={incidents.loading ? "Loading incidents…" : "No incidents recorded."}
        />
      </Panel>
      {add.open ? (
        <Modal title="Record incident" onClose={add.close}>
          <form onSubmit={create}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <StudentPicker value={student} onChange={setStudent} required />
              <Field label="Date" required>
                <input type="date" name="occurred_on" required defaultValue={today()} max={today()} />
              </Field>
              <Field label="Incident type">
                <select name="category" defaultValue="other">
                  {INCIDENT_CATEGORIES.map((k) => (
                    <option key={k} value={k}>
                      {label(k)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Severity">
                <select name="severity" defaultValue="low">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </Field>
              <Field label="Place">
                <input name="place" />
              </Field>
              <Field label="Witnesses">
                <input name="witnesses" />
              </Field>
              <Field label="What happened" required full>
                <textarea name="description" required />
              </Field>
            </div>
            <ModalActions onClose={add.close} saving={saving} label="Record incident" />
          </form>
        </Modal>
      ) : null}
    </>
  );
}

const ACTION_KINDS = ["verbal_warning", "written_warning", "parent_meeting", "detention", "suspension", "community_service", "counselling_referral", "other"];

/** SCR-224, live: GET/PATCH/DELETE /discipline/incidents/{id} (?id=), POST …/actions, …/share, DELETE /discipline/actions/{id}, POST/DELETE /wellbeing/discipline/actions/{id}/serve; without ?id= the outstanding actions from /wellbeing/discipline/actions. */
export function IncidentFollowUp() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const adding = useSearchParams().get("new") === "1";
  const incident = useApi<Incident>(id ? `${DISC}/incidents/${id}` : null);
  const outstanding = useApi<{ actions: OutstandingAction[]; outstanding: number; overdue: number }>(`${WELL}/discipline/actions`, { outstanding_only: !id || undefined });
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => router.replace(`${routeOf(224)}?id=${id}`);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      notify(msg);
      incident.reload();
      outstanding.reload();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  if (!id) {
    const acts = outstanding.data?.actions ?? [];
    return (
      <>
        <ErrorNote>{outstanding.error}</ErrorNote>
        <Panel title="Outstanding sanctions" sub={outstanding.data ? `${outstanding.data.outstanding} outstanding · ${outstanding.data.overdue} overdue · choose one to open its incident` : "Loading…"} flush>
          <DataTable
            columns={["Student", "Incident", "Action", "Due date", "Assigned by", "Status"]}
            rows={acts.map((a) => [{ name: a.student_name ?? "—", sub: a.section_label ?? undefined }, a.reference_no ?? `#${a.incident_id}`, label(a.kind), date(a.end_date ?? a.start_date), a.assigned_by ?? "—", a.is_served ? "Served" : a.overdue ? "Overdue" : "Pending"])}
            selectable={false}
            onView={(i) => router.push(`${routeOf(224)}?id=${acts[i].incident_id}`)}
            empty={outstanding.loading ? "Loading…" : "No outstanding sanctions."}
          />
        </Panel>
        <div className="gap" />
        <Link href={routeOf(223)} className="btn">
          <Icon name="arrow" className="sm" />
          All incidents
        </Link>
      </>
    );
  }
  if (incident.loading && !incident.data) return <Loading what="Loading the incident…" />;
  const inc = incident.data;
  if (!inc) return <ErrorNote>{incident.error ?? "Incident not found."}</ErrorNote>;
  const actions = inc.actions ?? [];
  const latest = actions[actions.length - 1];
  const served = new Map((outstanding.data?.actions ?? []).map((a) => [a.id, a]));
  const editable = inc.can_edit !== false;

  async function addAction(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (
      await run(
        () =>
          api.post(`${DISC}/incidents/${inc!.id}/actions`, {
            kind: formText(f, "kind"),
            details: formText(f, "details"),
            start_date: formText(f, "start_date"),
            end_date: formText(f, "end_date"),
            notify_parents: f.get("notify_parents") === "on",
            open_counselling_case: f.get("open_counselling_case") === "on",
          }),
        "Action recorded.",
      )
    )
      close();
  }

  async function closeIncident(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (await run(() => api.patch(`${DISC}/incidents/${inc!.id}`, { status: formText(f, "status"), resolution: formText(f, "resolution") }), "Incident updated.")) setClosing(false);
  }

  async function share() {
    const message = window.prompt("Message to the parents (optional):") ?? null;
    if (message === null) return;
    await run(() => api.post(`${DISC}/incidents/${inc!.id}/share`, { message: message.trim() || null }), "Shared with the parents.");
  }

  const timeline: { t: string; h: string; p: string; icon: "file" | "check" | "message" | "calendar" }[] = [
    { t: inc.occurred_on, h: "Incident reported", p: `${inc.reported_by_name ?? "Staff"} · ${label(inc.category)}, ${label(inc.severity)} severity`, icon: "calendar" as const },
    ...actions.map((a) => ({ t: a.start_date ?? a.completed_on ?? inc.occurred_on, h: label(a.kind), p: [a.details, a.assigned_by_name ? `by ${a.assigned_by_name}` : null, a.completed_on ? `served ${date(a.completed_on)}` : null].filter(Boolean).join(" · "), icon: "file" as const })),
    ...(inc.parent_informed_at ? [{ t: inc.parent_informed_at, h: "Parents informed", p: "Shared with the family", icon: "message" as const }] : []),
    ...(inc.closed_on ? [{ t: inc.closed_on, h: `Incident ${label(inc.status).toLowerCase()}`, p: [inc.resolution, inc.closed_by_name].filter(Boolean).join(" · "), icon: "check" as const }] : []),
  ].reverse();

  return (
    <>
      <ErrorNote>{!adding && !closing ? error : null}</ErrorNote>
      <div className="two-col">
        <div className="stack">
          <Panel title="Case details" action={<Badge>{INCIDENT_STATUS[inc.status]}</Badge>}>
            <Kv
              rows={[
                ["Incident", inc.reference_no],
                ["Student", inc.student_name],
                ["Action", latest ? label(latest.kind) : "None yet"],
                ["Responsible staff", latest?.assigned_by_name ?? inc.reported_by_name ?? "—"],
                ["Due date", date(latest?.end_date ?? null)],
                ["Outcome", inc.resolution ?? "—"],
              ]}
            />
            <div className="gap" />
            <p>{inc.description}</p>
            {inc.place || inc.witnesses ? <p className="muted small">{[inc.place && `Place: ${inc.place}`, inc.witnesses && `Witnesses: ${inc.witnesses}`].filter(Boolean).join(" · ")}</p> : null}
          </Panel>
          <Panel title="Follow-up activity">
            {timeline.map((x, i) => (
              <div className="timeline-item" key={i}>
                <span className="timeline-dot">
                  <Icon name={x.icon} />
                </span>
                <div>
                  <h4>{x.h}</h4>
                  <p>{x.p || "—"}</p>
                </div>
                <time>{date(x.t).slice(0, 6)}</time>
              </div>
            ))}
          </Panel>
          {actions.length ? (
            <Panel title="Sanctions" flush>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Dates</th>
                      <th>Status</th>
                      <th className="right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actions.map((a) => {
                      const isServed = Boolean(a.completed_on) || served.get(a.id)?.is_served;
                      return (
                        <tr key={a.id}>
                          <td>{`${label(a.kind)}${a.details ? ` · ${a.details}` : ""}`}</td>
                          <td>{[a.start_date, a.end_date].filter(Boolean).map((d) => date(d)).join(" – ") || "—"}</td>
                          <td>
                            <Badge>{isServed ? "Served" : served.get(a.id)?.overdue ? "Overdue" : "Pending"}</Badge>
                          </td>
                          <td className="right">
                            {editable ? (
                              <div className="row" style={{ justifyContent: "flex-end" }}>
                                {isServed ? (
                                  <button type="button" className="btn" disabled={saving} onClick={() => run(() => api.delete(`${WELL}/discipline/actions/${a.id}/serve`), "Marked not served.")}>
                                    Undo served
                                  </button>
                                ) : (
                                  <button type="button" className="btn" disabled={saving} onClick={() => run(() => api.post(`${WELL}/discipline/actions/${a.id}/serve`, { served_on: today() }), "Marked served.")}>
                                    Mark served
                                  </button>
                                )}
                                <button type="button" className="btn" disabled={saving} onClick={() => window.confirm("Remove this action?") && run(() => api.delete(`${DISC}/actions/${a.id}`), "Action removed.")}>
                                  Remove
                                </button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}
        </div>
        <aside className="stack">
          <Panel title="Record information">
            <Kv
              rows={[
                ["Student", inc.student_name],
                ["Class", inc.section_label ?? "—"],
                ["Date", date(inc.occurred_on)],
                ["Status", INCIDENT_STATUS[inc.status]],
                ["Parents informed", inc.shared_with_parents ? dateTime(inc.parent_informed_at) : "Not yet"],
              ]}
            />
          </Panel>
          <Panel title="Next action">
            <p className="muted small">{editable ? "Record what was done, tell the parents, or close the incident." : "You can read this incident but not change it."}</p>
            <div className="gap" />
            {editable ? (
              <div className="stack">
                <Link href={`${routeOf(224)}?id=${inc.id}&new=1`} className="btn">
                  <Icon name="plus" className="sm" />
                  Add action
                </Link>
                {inc.status === "reported" ? (
                  <button type="button" className="btn" disabled={saving} onClick={() => run(() => api.patch(`${DISC}/incidents/${inc.id}`, { status: "investigating" }), "Marked as under review.")}>
                    Mark under review
                  </button>
                ) : null}
                {!inc.shared_with_parents ? (
                  <button type="button" className="btn" disabled={saving} onClick={share}>
                    Share with parents
                  </button>
                ) : null}
                {inc.status !== "closed" && inc.status !== "dismissed" ? (
                  <button type="button" className="btn" onClick={() => setClosing(true)}>
                    Close or dismiss
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn"
                  disabled={saving}
                  onClick={async () => {
                    if (window.confirm("Delete this incident?") && (await run(() => api.delete(`${DISC}/incidents/${inc.id}`), "Incident deleted."))) router.push(routeOf(223));
                  }}
                >
                  Delete incident
                </button>
              </div>
            ) : null}
          </Panel>
        </aside>
      </div>
      {adding ? (
        <Modal title={`Add action · ${inc.reference_no}`} onClose={close}>
          <form id="action-form" onSubmit={addAction}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <Field label="Action" required>
                <select name="kind" defaultValue="verbal_warning">
                  {ACTION_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {label(k)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Start date">
                <input type="date" name="start_date" defaultValue={today()} />
              </Field>
              <Field label="Due / end date">
                <input type="date" name="end_date" />
              </Field>
              <Field label="Details" full>
                <textarea name="details" />
              </Field>
              <label className="field">
                <span>Parents</span>
                <span className="row">
                  <input type="checkbox" name="notify_parents" />
                  Notify parents
                </span>
              </label>
              <label className="field">
                <span>Counselling</span>
                <span className="row">
                  <input type="checkbox" name="open_counselling_case" />
                  Open a counselling case
                </span>
              </label>
            </div>
            <ModalActions onClose={close} saving={saving} label="Save follow-up" />
          </form>
        </Modal>
      ) : null}
      {closing ? (
        <Modal title={`Close ${inc.reference_no}`} onClose={() => setClosing(false)}>
          <form onSubmit={closeIncident}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <Field label="Status">
                <select name="status" defaultValue="closed">
                  <option value="closed">Closed</option>
                  <option value="dismissed">Dismissed</option>
                  <option value="action_taken">Action taken</option>
                </select>
              </Field>
              <Field label="Resolution" required full>
                <textarea name="resolution" required />
              </Field>
            </div>
            <ModalActions onClose={() => setClosing(false)} saving={saving} label="Save" />
          </form>
        </Modal>
      ) : null}
    </>
  );
}

/** SCR-225, live: GET /wellbeing/emergency/thin; per student GET/POST /wellbeing/emergency/{id}, PUT …/order, DELETE /wellbeing/emergency/contacts/{id}. */
export function EmergencyContacts() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const add = useAddDialog(225);
  const thin = useApi<Thin>(`${WELL}/emergency/thin`);
  const chain = useApi<Chain>(id ? `${WELL}/emergency/${id}` : null);
  const [picked, setPicked] = useState<PickedStudent | null>(null);
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState<number[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = chain.data;
  useEffect(() => setOrder(null), [c]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      notify(msg);
      chain.reload();
      thin.reload();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addContact(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (await run(() => api.post(`${WELL}/emergency/${id}`, { contact_name: formText(f, "contact_name"), relationship: formText(f, "relationship"), phone: formText(f, "phone"), notes: formText(f, "notes"), availability: formText(f, "availability") }), "Contact added.")) add.close();
  }

  const links = c ? (order ? order.map((x) => c.chain.find((l) => l.id === x)!).filter(Boolean) : c.chain) : [];
  const move = (i: number, d: number) => {
    const ids = links.map((l) => l.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
  };
  const students = (thin.data?.students ?? []).filter((s) => !search.trim() || `${s.student_name} ${s.admission_no}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <>
      <div className="filterbar">
        <div style={{ minWidth: 320 }}>
          <StudentPicker label="Open a student's escalation chain" value={picked} onChange={(s) => { setPicked(null); if (s) router.push(`${routeOf(225)}?id=${s.id}`); }} />
        </div>
      </div>
      <ErrorNote>{!add.open ? (error ?? thin.error ?? chain.error) : null}</ErrorNote>
      {id ? (
        chain.loading && !c ? (
          <Loading what="Loading the contacts…" />
        ) : c ? (
          <>
            <Panel
              title={`${c.student_name} · escalation order`}
              sub={`${c.admission_no}${c.section_label ? ` · ${c.section_label}` : ""} · called in this order`}
              action={
                order ? (
                  <button type="button" className="btn primary" disabled={saving} onClick={() => run(() => api.put(`${WELL}/emergency/${c.student_id}/order`, { ordered_ids: order }), "Order saved.")}>
                    Save order
                  </button>
                ) : undefined
              }
              flush
            >
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Priority</th>
                      <th>Contact</th>
                      <th>Relationship</th>
                      <th>Phone</th>
                      <th>Availability</th>
                      <th>Notes</th>
                      <th className="right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((l, i) => (
                      <tr key={l.id}>
                        <td>{i + 1}</td>
                        <td>{l.contact_name}</td>
                        <td>{l.relationship}</td>
                        <td>{l.phone}</td>
                        <td>{l.availability ?? "—"}</td>
                        <td className="wrap">{l.notes ?? "—"}</td>
                        <td className="right">
                          <div className="row" style={{ justifyContent: "flex-end" }}>
                            <button type="button" className="btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                              ↑
                            </button>
                            <button type="button" className="btn" onClick={() => move(i, 1)} disabled={i === links.length - 1} aria-label="Move down">
                              ↓
                            </button>
                            <button type="button" className="btn" disabled={saving} onClick={() => window.confirm(`Remove ${l.contact_name}? The others renumber.`) && run(() => api.delete(`${WELL}/emergency/contacts/${l.id}`), "Contact removed.")}>
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!links.length ? <div className="table-empty">No escalation contacts yet. Add one.</div> : null}
            </Panel>
            <div className="gap" />
            <Panel title="Also on file">
              <Kv
                rows={[
                  ["Health profile contact", [c.profile_contact_name, c.profile_contact_relation, c.profile_contact_phone].filter(Boolean).join(" · ") || "—"],
                  ["Doctor", [c.doctor_name, c.doctor_phone].filter(Boolean).join(" · ") || "—"],
                ]}
              />
            </Panel>
          </>
        ) : null
      ) : (
        <>
          <div className="filterbar">
            <SearchBox value={search} onChange={setSearch} placeholder="Search emergency contacts & escalation…" />
          </div>
          <Panel title="Students with a thin escalation chain" sub={thin.data ? `${thin.data.count} student(s) · ${thin.data.none_at_all} with no contact at all` : "Loading…"} flush>
            <DataTable
              columns={["Student", "Class", "Contacts", "Availability", "Why it matters"]}
              rows={students.map((s) => [{ name: s.student_name, sub: s.admission_no }, s.section_label ?? "—", String(s.contacts), s.availability ?? "—", s.why])}
              selectable={false}
              onView={(i) => router.push(`${routeOf(225)}?id=${students[i].student_id}`)}
              empty={thin.loading ? "Loading…" : "Every student has at least two contacts."}
            />
          </Panel>
        </>
      )}
      {add.open && id ? (
        <Modal title={`Add contact${c ? ` · ${c.student_name}` : ""}`} onClose={add.close}>
          <form onSubmit={addContact}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <Field label="Contact name" required>
                <input name="contact_name" required />
              </Field>
              <Field label="Relationship" required>
                <input name="relationship" required placeholder="e.g. Aunt, Neighbour" />
              </Field>
              <Field label="Phone" required>
                <input name="phone" type="tel" required />
              </Field>
              <Field label="Availability">
                <input name="availability" maxLength={120} placeholder="e.g. Any time, or weekdays after 6 pm" />
              </Field>
              <Field label="Notes">
                <input name="notes" placeholder="e.g. Works nights" />
              </Field>
            </div>
            <ModalActions onClose={add.close} saving={saving} label="Add contact" />
          </form>
        </Modal>
      ) : null}
    </>
  );
}

/** Page-head link that needs the ?id= of the current record (hidden without one). */
export function IdAction({ screen, extra, icon, children }: { screen: number; extra: string; icon: "plus" | "check"; children: string }) {
  const id = useSearchParams().get("id");
  if (!id) return null;
  return (
    <Link href={`${routeOf(screen)}?id=${id}&${extra}`} className="btn primary">
      <Icon name={icon} className="sm" />
      {children}
    </Link>
  );
}
