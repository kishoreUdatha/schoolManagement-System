"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, Modal, ModalActions, orNull, today, useNewFlag, type Lab, type LabBooking } from "./common";

type Slot = { lab_id: number; lab_name: string; free: boolean; booking_id: number | null; booked_for: string | null; booked_by: string | null };
type Availability = {
  date: string;
  is_holiday: boolean;
  holiday_name: string | null;
  labs: { id: number; name: string }[];
  periods: { period_id: number; period_number: number; start_time: string; end_time: string; labs: Slot[] }[];
};
type Year = { id: number; name: string; is_current: boolean };
type ClassRow = { id: number; name: string; sections: { id: number; name: string }[] };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TONES = ["", "mint", "peach"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hhmm = (t: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${String(((h + 11) % 12) + 1).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/**
 * SCR-244, live: the month's lab bookings (GET /lab-bookings from/to),
 * booking a free period (GET /lab-availability, POST /lab-bookings) and
 * cancelling one (POST /lab-bookings/{id}/cancel).
 */
export function LabBookingCalendar() {
  const now = new Date();
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [labId, setLabId] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<LabBooking | null>(null);
  const [booking, closeBooking] = useNewFlag();
  const [bookDate, setBookDate] = useState<string | null>(null);

  const first = month;
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const labs = useApi<Lab[]>("/api/v1/school/labs", { active_only: true });
  const list = useApi<LabBooking[]>("/api/v1/school/lab-bookings", {
    from: iso(first),
    to: iso(last),
    lab_id: labId,
    include_cancelled: status === "all" || status === "cancelled" ? true : undefined,
    mine: status === "mine" ? true : undefined,
  });

  const bookings = (list.data ?? []).filter((b) => (status === "cancelled" ? b.status === "cancelled" : true));
  const byDay = useMemo(() => {
    const m = new Map<string, LabBooking[]>();
    bookings.forEach((b) => m.set(b.booking_date, [...(m.get(b.booking_date) ?? []), b]));
    m.forEach((v) => v.sort((a, b) => a.period_number - b.period_number));
    return m;
  }, [bookings]);
  const labTone = (id: number) => TONES[(labs.data ?? []).findIndex((l) => l.id === id) % 3] ?? "";

  // Monday-first grid, padded with the neighbouring months' days.
  const lead = (first.getDay() + 6) % 7;
  const cells: { d: Date; outside: boolean }[] = [];
  for (let i = lead; i > 0; i--) cells.push({ d: new Date(first.getFullYear(), first.getMonth(), 1 - i), outside: true });
  for (let i = 1; i <= last.getDate(); i++) cells.push({ d: new Date(first.getFullYear(), first.getMonth(), i), outside: false });
  for (let i = 1; cells.length % 7; i++) cells.push({ d: new Date(last.getFullYear(), last.getMonth() + 1, i), outside: true });
  const todayIso = today();

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <>
      <div className="filterbar">
        <select aria-label="Filter by lab" value={labId} onChange={(e) => setLabId(e.target.value)}>
          <option value="">Every lab</option>
          {labs.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Booked</option>
          <option value="mine">Booked by me</option>
          <option value="all">Booked and cancelled</option>
          <option value="cancelled">Cancelled only</option>
        </select>
        <button type="button" className="btn" onClick={() => shift(-1)} aria-label="Previous month">
          ‹
        </button>
        <button type="button" className="btn" onClick={() => shift(1)} aria-label="Next month">
          ›
        </button>
      </div>
      <ErrorNote>{list.error ?? labs.error}</ErrorNote>
      <Panel
        title={`${MONTHS[month.getMonth()]} ${month.getFullYear()}`}
        sub={`${bookings.length} booking(s)${labs.data ? ` · ${labs.data.length} lab(s)` : ""} · double-click a day to book it${list.loading ? " · Loading…" : ""}`}
        action={
          <button type="button" className="btn" onClick={() => setMonth(new Date(now.getFullYear(), now.getMonth(), 1))}>
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
            {cells.map(({ d, outside }) => {
              const key = iso(d);
              const day = outside ? [] : (byDay.get(key) ?? []);
              return (
                <div
                  key={key}
                  className={`calendar-day ${outside ? "outside" : ""} ${key === todayIso ? "today" : ""}`}
                  onDoubleClick={() => !outside && setBookDate(key)}
                >
                  <strong>{d.getDate()}</strong>
                  {day.slice(0, 3).map((b) => (
                    <button type="button" key={b.id} className={`cal-event ${labTone(b.lab_id)}`} onClick={() => setOpen(b)} style={b.status === "cancelled" ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>
                      {`${b.lab_name}${b.section_label ? ` · ${b.section_label}` : ""}`}
                      <br />
                      {b.start_time ? hhmm(b.start_time) : `Period ${b.period_number}`}
                    </button>
                  ))}
                  {day.length > 3 ? <small className="muted">{`+${day.length - 3} more`}</small> : null}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
      {!list.loading && labs.data?.length === 0 ? <p className="muted">No labs have been set up yet. Add one in the Lab Register before booking.</p> : null}
      {open ? <BookingDetail b={open} onClose={() => setOpen(null)} onChanged={() => (setOpen(null), list.reload())} /> : null}
      {booking || bookDate ? (
        <BookDialog
          initialDate={bookDate ?? todayIso}
          onClose={() => {
            setBookDate(null);
            if (booking) closeBooking();
          }}
          onSaved={() => {
            setBookDate(null);
            if (booking) closeBooking();
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}

function BookingDetail({ b, onClose, onChanged }: { b: LabBooking; onClose: () => void; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/lab-bookings/${b.id}/cancel`, undefined, { reason: reason.trim() || undefined });
      notify("Booking cancelled. The period is free again.");
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`${b.lab_name} · ${date(b.booking_date)}`} onClose={onClose}>
      <ErrorNote>{error}</ErrorNote>
      <dl className="kv">
        {(
          [
            ["Period", `${b.period_number}${b.start_time ? ` · ${hhmm(b.start_time)}${b.end_time ? `–${hhmm(b.end_time)}` : ""}` : ""}`],
            ["Class", b.section_label ?? "—"],
            ["Subject", b.subject_name ?? "—"],
            ["Teacher", b.teacher_name ?? "—"],
            ["Purpose", b.purpose ?? "—"],
            ["Students", b.students !== null ? String(b.students) : "—"],
            ["Status", label(b.status)],
          ] as [string, string][]
        ).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {b.status !== "cancelled" ? (
        <form onSubmit={cancel} style={{ marginTop: 18 }}>
          <Field label="Reason for cancelling">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
          </Field>
          <ModalActions saving={saving} label="Cancel booking" onCancel={onClose} />
        </form>
      ) : null}
    </Modal>
  );
}

function BookDialog({ initialDate, onClose, onSaved }: { initialDate: string; onClose: () => void; onSaved: () => void }) {
  const [day, setDay] = useState(initialDate);
  const [slot, setSlot] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const av = useApi<Availability>(day ? "/api/v1/school/lab-availability" : null, { date: day });
  const years = useApi<Year[]>("/api/v1/school/academic-years");
  const yearId = years.data?.find((y) => y.is_current)?.id ?? years.data?.[0]?.id;
  const classes = useApi<ClassRow[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });

  useEffect(() => setSlot(""), [day]);
  const free = (av.data?.periods ?? []).flatMap((p) => p.labs.filter((s) => s.free).map((s) => ({ key: `${s.lab_id}:${p.period_id}`, text: `${s.lab_name} · Period ${p.period_number} (${hhmm(p.start_time)}–${hhmm(p.end_time)})` })));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const [lab, period] = slot.split(":").map(Number);
    const section = orNull(f.get("section_id"));
    const students = orNull(f.get("students"));
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/v1/school/lab-bookings", {
        lab_id: lab,
        booking_date: day,
        period_id: period,
        section_id: section ? Number(section) : null,
        purpose: orNull(f.get("purpose")),
        students: students ? Number(students) : null,
      });
      notify("Lab booked.");
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Book lab" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorNote>{error ?? av.error}</ErrorNote>
        <div className="form-grid">
          <Field label="Date" required>
            <input type="date" required value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label="Lab and period" required>
            <select required value={slot} onChange={(e) => setSlot(e.target.value)}>
              <option value="">{av.loading ? "Checking what is free…" : free.length ? "Choose a free period" : "Nothing free on this day"}</option>
              {free.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.text}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Class">
            <select name="section_id" defaultValue="">
              <option value="">Not set</option>
              {classes.data?.flatMap((c) =>
                c.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {`${c.name} ${s.name}`}
                  </option>
                )),
              )}
            </select>
          </Field>
          <Field label="Students">
            <input name="students" type="number" min={1} />
          </Field>
          <Field label="Purpose" full>
            <input name="purpose" placeholder="Practical: titration" />
          </Field>
        </div>
        {av.data?.is_holiday ? <p className="muted small" style={{ marginTop: 10 }}>{`Holiday — ${av.data.holiday_name ?? ""}`}</p> : null}
        {av.data && av.data.labs.length === 0 ? <p className="muted small" style={{ marginTop: 10 }}>No labs have been set up yet.</p> : null}
        <ModalActions saving={saving} label="Book lab" onCancel={onClose} />
      </form>
    </Modal>
  );
}
