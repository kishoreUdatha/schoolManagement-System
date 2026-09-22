"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Avatar, Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { MEETING_MODE, type MeetingMode, type ParentPtm, type PtmDetail, type PtmSession, type PtmSlot, SLOT_STATUS, type TeacherPtm, hhmm, useRole } from "./shared";

import { ask } from "@/lib/dialog";
type Child = { id: number; full_name: string; section_label?: string | null };

/** SCR-251: parents book, teachers record meetings, the office oversees. */
export function PtmSlotBooking() {
  const role = useRole();
  if (role === null) return <Loading />;
  if (role === "parent") return <ParentBooking />;
  if (role === "teacher") return <TeacherSlots />;
  if (role === "school_admin") return <OfficeSlots />;
  return <ErrorNote>Parent-teacher meeting slots are for parents, teachers and the school office.</ErrorNote>;
}

/** The mock's "Confirm booking" button; it submits the parent's booking form. */
export function ConfirmBookingButton() {
  const role = useRole();
  if (role !== "parent") return null;
  return (
    <button type="submit" form="ptm-booking" className="btn primary">
      <Icon name="check" className="sm" />
      Confirm booking
    </button>
  );
}

const field = (text: string, control: JSX.Element, required = false) => (
  <label className="field">
    <span>
      {text}
      {required ? <span className="req">*</span> : null}
    </span>
    {control}
  </label>
);

const kv = (rows: [string, string][]) => (
  <dl className="kv">
    {rows.map(([k, v]) => (
      <div key={k}>
        <dt>{k}</dt>
        <dd>{v}</dd>
      </div>
    ))}
  </dl>
);

/* ---------- parent ---------- */

/**
 * Parent, live: GET /api/v1/parent/me/ptm and /parent/me/children;
 * POST /parent/me/ptm/book; DELETE /parent/me/ptm/slots/{id} to cancel.
 */
function ParentBooking() {
  const meetings = useApi<ParentPtm[]>("/api/v1/parent/me/ptm");
  const kids = useApi<Child[]>("/api/v1/parent/me/children");
  const [items, setItems] = useState<ParentPtm[] | null>(null);
  const [meetingId, setMeetingId] = useState("");
  const [childId, setChildId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [slotId, setSlotId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = items ?? meetings.data ?? [];
  const m = list.find((x) => String(x.id) === meetingId) ?? list[0];
  const eligible = m?.eligible_children ?? [];
  const child = childId && eligible.includes(Number(childId)) ? Number(childId) : eligible[0];
  const t = m?.teachers.find((x) => String(x.teacher_user_id) === teacherId) ?? m?.teachers.find((x) => child !== undefined && x.teaches.includes(child)) ?? m?.teachers[0];
  const nameOf = (id: number | null) => kids.data?.find((c) => c.id === id)?.full_name ?? "your child";
  const mineForChild = t?.slots.find((x) => x.state === "mine" && x.student_id === child);

  useEffect(() => setSlotId(null), [meetingId, childId, teacherId]);

  async function book(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!m || !m.booking_open) return setError("Booking is closed for this meeting.");
    if (!slotId || child === undefined) return setError("Choose a free time first.");
    const form = new FormData(e.currentTarget);
    const note = String(form.get("note") ?? "").trim();
    const meeting_mode = String(form.get("meeting_mode") ?? "in_person");
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<ParentPtm[]>("/api/v1/parent/me/ptm/book", { slot_id: slotId, student_id: child, note: note || null, meeting_mode });
      setItems(r);
      setSlotId(null);
      notify("Booked. The teacher can see your booking.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function cancel(slot: { id: number; start_time: string }) {
    if (!(await ask(`Cancel your ${hhmm(slot.start_time)} meeting?`))) return;
    try {
      setItems(await api.delete<ParentPtm[]>(`/api/v1/parent/me/ptm/slots/${slot.id}`));
      notify("Booking cancelled.");
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (meetings.loading && !meetings.data) return <Loading what="Loading meetings…" />;
  if (!list.length) return <ErrorNote>{meetings.error ?? "No parent-teacher meeting is open for booking right now."}</ErrorNote>;
  const selected = t?.slots.find((x) => x.id === slotId);
  const mine = list.flatMap((x) => x.teachers.flatMap((tt) => tt.slots.filter((s) => s.state === "mine").map((s) => ({ meeting: x, teacher: tt, slot: s }))));

  return (
    <div className="two-col">
      <div>
        <form id="ptm-booking" className="panel" onSubmit={book}>
          <div className="panel-head">
            <h2>Select your meeting slot</h2>
          </div>
          <div className="panel-body">
            <ErrorNote>{error ?? meetings.error}</ErrorNote>
            <div className="form-grid">
              {field(
                "Student",
                <select value={child ?? ""} required onChange={(e) => setChildId(e.target.value)}>
                  {eligible.map((id) => (
                    <option key={id} value={id}>
                      {nameOf(id)}
                    </option>
                  ))}
                </select>,
                true,
              )}
              {field(
                "Teacher",
                <select value={t?.teacher_user_id ?? ""} required onChange={(e) => setTeacherId(e.target.value)}>
                  {m?.teachers.map((x) => (
                    <option key={x.teacher_user_id} value={x.teacher_user_id}>
                      {x.teaches.length ? `${x.teacher_name} (teaches ${x.teaches.map(nameOf).join(", ")})` : x.teacher_name}
                    </option>
                  ))}
                </select>,
                true,
              )}
              {field(
                "Meeting",
                <select value={m?.id ?? ""} required onChange={(e) => setMeetingId(e.target.value)}>
                  {list.map((x) => (
                    <option key={x.id} value={x.id}>
                      {`${x.title} · ${date(x.meeting_date)}`}
                    </option>
                  ))}
                </select>,
                true,
              )}
              {field(
                "Meeting mode",
                <select name="meeting_mode" defaultValue="in_person">
                  {(Object.keys(MEETING_MODE) as MeetingMode[]).map((k) => (
                    <option key={k} value={k}>
                      {MEETING_MODE[k]}
                    </option>
                  ))}
                </select>,
              )}
            </div>
            <div className="gap" />
            <h3>{m ? `Available times · ${date(m.meeting_date)}` : "Available times"}</h3>
            {!m?.booking_open ? <p className="muted small">Booking is closed for this meeting.</p> : null}
            {mineForChild ? <p className="muted small">{`${nameOf(child ?? null)} already has ${hhmm(mineForChild.start_time)} with this teacher. Cancel it to pick another time.`}</p> : null}
            <div className="slot-grid">
              {t?.slots.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={`slot ${x.id === slotId || x.state === "mine" ? "selected" : ""}`}
                  disabled={!m?.booking_open || x.state !== "open" || Boolean(mineForChild)}
                  title={x.state === "mine" ? `Booked for ${nameOf(x.student_id)}` : x.state === "taken" ? "Taken" : undefined}
                  onClick={() => setSlotId(x.id)}
                >
                  {hhmm(x.start_time)}
                </button>
              ))}
            </div>
            {field("Topic", <input name="note" maxLength={300} placeholder="Anything the teacher should know (optional)" />)}
          </div>
          <div className="form-footer">
            <button type="submit" className="btn primary" disabled={saving || !slotId}>
              <Icon name="check" className="sm" />
              {saving ? "Booking…" : "Confirm booking"}
            </button>
          </div>
        </form>
      </div>
      <aside className="stack">
        <Panel title="Meeting details">
          <div className="person">
            <Avatar name={t?.teacher_name ?? "Teacher"} index={0} />
            <div>
              {t?.teacher_name ?? "—"}
              <small>{m?.scope_label ?? ""}</small>
            </div>
          </div>
          <div className="gap" />
          {kv([
            ["Student", child !== undefined ? nameOf(child) : "—"],
            ["Time", selected ? `${hhmm(selected.start_time)}–${hhmm(selected.end_time)}` : "Choose a time"],
            ["Venue", m?.venue ?? "—"],
            ["Slot duration", m ? `${m.slot_minutes} minutes` : "—"],
            ["Bookings close", m?.booking_closes_at ? dateTime(m.booking_closes_at) : "—"],
          ])}
          {m?.notes ? <p className="muted small" style={{ marginTop: 12 }}>{m.notes}</p> : null}
        </Panel>
        <Panel title="Your bookings">
          {mine.length ? (
            mine.map(({ meeting, teacher, slot }) => (
              <div className="timeline-item" key={slot.id}>
                <span className="timeline-dot">
                  <Icon name="calendar" />
                </span>
                <div>
                  <h4>{`${teacher.teacher_name} · ${hhmm(slot.start_time)}`}</h4>
                  <p>{`${nameOf(slot.student_id)} · ${date(meeting.meeting_date)}${slot.meeting_mode ? ` · ${MEETING_MODE[slot.meeting_mode]}` : ""}${slot.teacher_notes ? ` · Notes: ${slot.teacher_notes}` : ""}`}</p>
                </div>
                {slot.status === "booked" && meeting.booking_open ? (
                  <button type="button" className="btn" onClick={() => cancel(slot)}>
                    Cancel
                  </button>
                ) : (
                  <Badge>{slot.status ? SLOT_STATUS[slot.status] : "Booked"}</Badge>
                )}
              </div>
            ))
          ) : (
            <p className="muted small">You have not booked a meeting yet.</p>
          )}
        </Panel>
      </aside>
    </div>
  );
}

/* ---------- staff: shared slot grid ---------- */

function SlotGrid({ slots, selectedId, onPick }: { slots: PtmSlot[]; selectedId: number | null; onPick: (s: PtmSlot) => void }) {
  return (
    <div className="slot-grid">
      {slots.map((x) => (
        <button
          key={x.id}
          type="button"
          className={`slot ${x.id === selectedId ? "selected" : ""}`}
          disabled={!x.student_id}
          title={x.student_id ? `${x.student_name ?? ""} · ${SLOT_STATUS[x.status]}` : "Free"}
          onClick={() => onPick(x)}
        >
          {hhmm(x.start_time)}
          {x.student_name ? <small style={{ display: "block" }}>{`${x.student_name.split(" ")[0]} · ${SLOT_STATUS[x.status]}`}</small> : null}
        </button>
      ))}
    </div>
  );
}

function SlotFacts({ slot }: { slot: PtmSlot | undefined }) {
  if (!slot) return <p className="muted small">Choose a booked time to see who is coming.</p>;
  return kv([
    ["Student", slot.student_name ? `${slot.student_name}${slot.class_label ? ` · ${slot.class_label}` : ""}` : "—"],
    ["Parent", slot.parent_name ?? "—"],
    ["Time", `${hhmm(slot.start_time)}–${hhmm(slot.end_time)}`],
    ["Status", SLOT_STATUS[slot.status]],
    ["Meeting mode", slot.meeting_mode ? MEETING_MODE[slot.meeting_mode] : "—"],
    ["Parent’s note", slot.parent_note ?? "—"],
  ]);
}

/**
 * Teacher, live: GET /api/v1/teacher/ptm; PUT /teacher/ptm/slots/{id} to
 * record a meeting (done / no-show, notes shared with the parent);
 * POST /teacher/ptm/sessions/{id}/publish for a draft they arranged.
 */
function TeacherSlots() {
  const res = useApi<TeacherPtm[]>("/api/v1/teacher/ptm");
  const [meetingId, setMeetingId] = useState("");
  const [slotId, setSlotId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const list = res.data ?? [];
  const m = list.find((x) => String(x.id) === meetingId) ?? list[0];
  const slot = m?.slots.find((x) => x.id === slotId);
  const myId = useSession()?.user.id;

  async function record(status: "done" | "no_show") {
    if (!slot) return;
    try {
      await api.put(`/api/v1/teacher/ptm/slots/${slot.id}`, { status, teacher_notes: notes.trim() || null });
      notify(status === "done" && notes.trim() ? "Saved. Your notes were shared with the parent." : "Saved.");
      res.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function publish() {
    if (!m) return;
    try {
      await api.post(`/api/v1/teacher/ptm/sessions/${m.id}/publish`);
      notify("Published: parents can now book.");
      res.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (res.loading && !res.data) return <Loading what="Loading your meetings…" />;
  if (!list.length) {
    return (
      <section className="panel">
        <div className="panel-pad">
          <ErrorNote>{res.error}</ErrorNote>
          <p className="muted" style={{ marginBottom: 14 }}>You are not in any upcoming parent-teacher meeting.</p>
          <Link href={routeOf(250)} className="btn primary">
            <Icon name="plus" className="sm" />
            Arrange a meeting
          </Link>
        </div>
      </section>
    );
  }
  const booked = m?.slots.filter((x) => x.student_id).length ?? 0;

  return (
    <div className="two-col">
      <section className="panel">
        <div className="panel-head">
          <h2>Your meeting slots</h2>
          {m && !m.is_published && m.created_by_user_id === myId ? (
            <button type="button" className="btn primary" onClick={publish}>
              Publish for booking
            </button>
          ) : null}
        </div>
        <div className="panel-body">
          <ErrorNote>{error ?? res.error}</ErrorNote>
          <div className="form-grid">
            {field(
              "Meeting",
              <select
                value={m?.id ?? ""}
                onChange={(e) => {
                  setMeetingId(e.target.value);
                  setSlotId(null);
                }}
              >
                {list.map((x) => (
                  <option key={x.id} value={x.id}>
                    {`${x.title} · ${date(x.meeting_date)}${x.is_published ? "" : " (draft)"}`}
                  </option>
                ))}
              </select>,
            )}
            {field("For", <input value={m?.scope_label ?? ""} readOnly />)}
          </div>
          <div className="gap" />
          <h3>{m ? `${date(m.meeting_date)} · ${booked} of ${m.slots.length} booked` : ""}</h3>
          <SlotGrid
            slots={m?.slots ?? []}
            selectedId={slotId}
            onPick={(x) => {
              setSlotId(x.id);
              setNotes(x.teacher_notes ?? "");
            }}
          />
        </div>
      </section>
      <aside className="stack">
        <Panel title="Meeting details">
          <SlotFacts slot={slot} />
          {slot ? (
            <>
              <div className="gap" />
              <label className="field">
                <span>Notes for the parent</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What you discussed, and what to work on at home" />
              </label>
              <div className="gap" />
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn primary" onClick={() => record("done")}>
                  <Icon name="check" className="sm" />
                  Mark met
                </button>
                <button type="button" className="btn" onClick={() => record("no_show")}>
                  Parent did not come
                </button>
              </div>
            </>
          ) : null}
        </Panel>
      </aside>
    </div>
  );
}

/**
 * Office, live: GET /api/v1/school/ptm, GET /ptm/{id} (?id=), and
 * DELETE /ptm/{id}/slots/{slot}/booking to cancel a booking (the parent is told).
 */
function OfficeSlots() {
  const router = useRouter();
  const idParam = useSearchParams().get("id");
  const sessions = useApi<PtmSession[]>("/api/v1/school/ptm");
  const id = idParam ?? (sessions.data?.[0] ? String(sessions.data[0].id) : null);
  const detail = useApi<PtmDetail>(id ? `/api/v1/school/ptm/${id}` : null);
  const [teacherId, setTeacherId] = useState("");
  const [slotId, setSlotId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const s = detail.data;
  const t = useMemo(() => s?.teachers.find((x) => String(x.teacher_user_id) === teacherId) ?? s?.teachers[0], [s, teacherId]);
  const slot = t?.slots.find((x) => x.id === slotId);

  async function cancelBooking() {
    if (!s || !slot) return;
    if (!(await ask(`Cancel ${slot.student_name}'s ${hhmm(slot.start_time)} booking? The parent will be told.`))) return;
    try {
      await api.delete(`/api/v1/school/ptm/${s.id}/slots/${slot.id}/booking`);
      notify("Booking cancelled.");
      setSlotId(null);
      detail.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (sessions.loading && !sessions.data) return <Loading what="Loading meetings…" />;
  if (!sessions.data?.length) {
    return (
      <section className="panel">
        <div className="panel-pad">
          <ErrorNote>{sessions.error}</ErrorNote>
          <p className="muted" style={{ marginBottom: 14 }}>No parent-teacher meeting has been arranged yet.</p>
          <Link href={routeOf(250)} className="btn primary">
            <Icon name="plus" className="sm" />
            Set up a meeting
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="two-col">
      <section className="panel">
        <div className="panel-head">
          <h2>Meeting slots</h2>
          {s ? (
            <Link href={`${routeOf(250)}?id=${s.id}`} className="btn">
              Edit meeting
            </Link>
          ) : null}
        </div>
        <div className="panel-body">
          <ErrorNote>{error ?? detail.error ?? sessions.error}</ErrorNote>
          <div className="form-grid">
            {field(
              "Meeting",
              <select
                value={id ?? ""}
                onChange={(e) => {
                  setTeacherId("");
                  setSlotId(null);
                  router.replace(`${routeOf(251)}?id=${e.target.value}`);
                }}
              >
                {sessions.data.map((x) => (
                  <option key={x.id} value={x.id}>
                    {`${x.title} · ${date(x.meeting_date)}${x.is_published ? "" : " (draft)"}`}
                  </option>
                ))}
              </select>,
            )}
            {field(
              "Teacher",
              <select
                value={t?.teacher_user_id ?? ""}
                onChange={(e) => {
                  setTeacherId(e.target.value);
                  setSlotId(null);
                }}
              >
                {!s?.teachers.length ? <option value="">No teachers added yet</option> : null}
                {s?.teachers.map((x) => (
                  <option key={x.teacher_user_id} value={x.teacher_user_id}>
                    {`${x.teacher_name} · ${x.slots.filter((y) => y.student_id).length}/${x.slots.length} booked`}
                  </option>
                ))}
              </select>,
            )}
          </div>
          <div className="gap" />
          <h3>{s ? `${date(s.meeting_date)} · ${s.booked_count} of ${s.slot_count} slots booked · ${s.is_published ? "open for booking" : "draft"}` : "Loading…"}</h3>
          <SlotGrid slots={t?.slots ?? []} selectedId={slotId} onPick={(x) => setSlotId(x.id)} />
        </div>
      </section>
      <aside className="stack">
        <Panel title="Meeting details">
          <SlotFacts slot={slot} />
          {slot?.teacher_notes ? <p className="muted small" style={{ marginTop: 12 }}>{`Teacher’s notes: ${slot.teacher_notes}`}</p> : null}
          {slot?.status === "booked" ? (
            <>
              <div className="gap" />
              <button type="button" className="btn" onClick={cancelBooking}>
                Cancel booking
              </button>
            </>
          ) : null}
          <div className="gap" />
          {s
            ? kv([
                ["Venue", s.venue ?? "—"],
                ["Slot duration", `${s.slot_minutes} minutes`],
                ["For", s.scope_label || "—"],
                ["Bookings close", s.booking_closes_at ? dateTime(s.booking_closes_at) : "—"],
              ])
            : null}
        </Panel>
      </aside>
    </div>
  );
}
