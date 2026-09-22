"use client";

/*
 * PM-039 · Book a PTM. The server reserves the slot atomically
 * (POST /parent/me/ptm/book locks the slot row and refuses a taken one with
 * 409). When the slot has gone, the screen reloads the meeting and shows the
 * times that are still free.
 */

import { useEffect, useMemo, useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, ApiError, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { hhmm, PmEmpty, PmError, PmLoading, useGoTo } from "../comms/ui";
import { longDate, PTM, type PtmSession } from "./common";

export function BookPtm() {
  const { childId, child } = useParent();
  const goTo = useGoTo();
  const ptm = useApi<PtmSession[]>(PTM);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const [slotId, setSlotId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);

  const sessions = useMemo(() => (ptm.data ?? []).filter((s) => childId !== null && s.eligible_children.includes(childId)), [ptm.data, childId]);
  const session = sessions.find((s) => s.id === sessionId) ?? sessions.find((s) => s.booking_open) ?? sessions[0] ?? null;
  const teachers = useMemo(
    () => [...(session?.teachers ?? [])].sort((a, b) => Number(childId !== null && b.teaches.includes(childId)) - Number(childId !== null && a.teaches.includes(childId))),
    [session, childId],
  );
  const teacher = teachers.find((t) => t.teacher_user_id === teacherId) ?? teachers[0] ?? null;
  const booked = teacher?.slots.find((x) => x.state === "mine" && x.student_id === childId) ?? null;
  const slot = teacher?.slots.find((x) => x.id === slotId && x.state === "open") ?? null;

  // Selections belong to one child.
  useEffect(() => {
    setSessionId(null);
    setTeacherId(null);
    setSlotId(null);
    setNote("");
    setError(null);
    setTaken(false);
  }, [childId]);

  async function confirm() {
    if (!slot || !childId || busy) return;
    setBusy(true);
    setError(null);
    setTaken(false);
    try {
      await api.post<PtmSession[]>(`${PTM}/book`, { slot_id: slot.id, student_id: childId, note: note.trim() || null });
      goTo(40, { slot: slot.id });
    } catch (e) {
      setSlotId(null);
      setTaken(e instanceof ApiError && e.status === 409);
      setError(errorText(e));
      ptm.reload(); // fresh slots: the alternatives below are current
    } finally {
      setBusy(false);
    }
  }

  if (!childId || (ptm.loading && !ptm.data)) return <PmLoading />;
  if (ptm.error && !ptm.data) return <PmError>{ptm.error}</PmError>;
  if (!session) return <PmEmpty title="No meetings scheduled">{`There is no parent–teacher meeting open to ${child?.full_name ?? "this child"} right now.`}</PmEmpty>;

  const open = teacher?.slots.filter((x) => x.state === "open") ?? [];
  return (
    <>
      {sessions.length > 1 ? (
        <label className="field">
          Meeting
          <select
            value={session.id}
            onChange={(e) => {
              setSessionId(Number(e.target.value));
              setTeacherId(null);
              setSlotId(null);
            }}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {`${s.title} · ${longDate(s.meeting_date)}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="field">
        Teacher
        <select
          value={teacher?.teacher_user_id ?? ""}
          onChange={(e) => {
            setTeacherId(Number(e.target.value));
            setSlotId(null);
          }}
        >
          {teachers.map((t) => (
            <option key={t.teacher_user_id} value={t.teacher_user_id}>
              {`${t.teacher_name}${t.teaches.includes(childId) ? ` · teaches ${child?.full_name.split(" ")[0] ?? "your child"}` : ""}`}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Date
        <select value={session.id} disabled>
          <option value={session.id}>{`${longDate(session.meeting_date)}${session.venue ? ` · ${session.venue}` : ""}`}</option>
        </select>
      </label>
      {session.notes ? <p className="micro">{session.notes}</p> : null}
      {!session.booking_open ? (
        <div className="panel soft">
          <p>Booking for this meeting has closed.</p>
        </div>
      ) : session.booking_closes_at ? (
        <p className="micro">{`Bookings close ${dateTime(session.booking_closes_at)}.`}</p>
      ) : null}
      <PmError>{taken ? `${error} The times below are the ones still free.` : error}</PmError>
      {booked ? (
        <div className="panel soft">
          <p>{`${child?.full_name ?? "Your child"} already has a meeting with ${teacher?.teacher_name} at ${hhmm(booked.start_time)}.`}</p>
          <button className="action secondary" onClick={() => goTo(40, { slot: booked.id })}>
            View appointment
          </button>
        </div>
      ) : (
        <>
          <h3>Available time slots</h3>
          {open.length ? (
            <div className="slots">
              {teacher!.slots.map((x) =>
                x.state === "open" ? (
                  <button key={x.id} className={x.id === slotId ? "selected" : ""} disabled={!session.booking_open} aria-pressed={x.id === slotId} onClick={() => setSlotId(x.id)}>
                    {hhmm(x.start_time)}
                  </button>
                ) : x.state === "taken" ? (
                  <button key={x.id} disabled style={{ textDecoration: "line-through", opacity: 0.5 }} aria-label={`${hhmm(x.start_time)} taken`}>
                    {hhmm(x.start_time)}
                  </button>
                ) : null,
              )}
            </div>
          ) : (
            <p className="muted">{`No free times left with ${teacher?.teacher_name ?? "this teacher"}. Try another teacher.`}</p>
          )}
          <label className="field">
            Discussion topic (optional)
            <textarea rows={3} placeholder="What would you like to discuss?" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </label>
          <button className="action" disabled={!slot || busy || !session.booking_open} onClick={confirm}>
            {busy ? "Booking…" : slot ? `Confirm ${hhmm(slot.start_time)}` : "Choose a time"}
          </button>
        </>
      )}
    </>
  );
}
