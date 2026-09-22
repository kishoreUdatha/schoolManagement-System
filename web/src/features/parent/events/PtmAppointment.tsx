"use client";

/*
 * PM-040 · PTM appointment: the selected child's booking (?slot=, or the next
 * one), its place and time, and cancellation while bookings are open
 * (DELETE /parent/me/ptm/slots/{slot}).
 */

import { useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { dateTime, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { hhmm, PmEmpty, PmError, PmLoading, useGoTo, useQueryId } from "../comms/ui";
import { iso, longDate, myBookings, PTM, type PtmSession } from "./common";

export function PtmAppointment() {
  const { childId, child, notify } = useParent();
  const goTo = useGoTo();
  const slotId = useQueryId("slot");
  const ptm = useApi<PtmSession[]>(PTM);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!childId || (ptm.loading && !ptm.data)) return <PmLoading />;
  if (ptm.error && !ptm.data) return <PmError>{ptm.error}</PmError>;

  const mine = myBookings(ptm.data, childId);
  const today = iso(new Date());
  const b = (slotId ? mine.find((x) => x.slot.id === slotId) : null) ?? (slotId ? null : (mine.find((x) => x.session.meeting_date >= today) ?? null));

  if (!b)
    return (
      <>
        <PmEmpty title="No appointment">{`${child?.full_name ?? "This child"} has no parent–teacher meeting booked${slotId ? " with that booking" : ""}.`}</PmEmpty>
        <button className="action" onClick={() => goTo(39)}>
          Book a PTM
        </button>
      </>
    );

  const { session, teacher, slot } = b;
  const canCancel = slot.status === "booked" && session.booking_open;

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await api.delete<PtmSession[]>(`${PTM}/slots/${slot.id}`);
      notify("Appointment cancelled.");
      goTo(39);
    } catch (e) {
      setError(errorText(e));
      setConfirming(false);
      ptm.reload();
    } finally {
      setBusy(false);
    }
  }

  const done = slot.status === "done" || slot.status === "no_show";
  return (
    <>
      <div className="success-icon">{done ? "•" : "✓"}</div>
      <h1 className="center">{slot.status === "done" ? "Meeting held." : slot.status === "no_show" ? "Marked as missed." : "You’re booked."}</h1>
      <div className="panel">
        <dl>
          <div>
            <dt>Teacher</dt>
            <dd>{teacher.teacher_name}</dd>
          </div>
          <div>
            <dt>For</dt>
            <dd>{child?.full_name}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{longDate(session.meeting_date)}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{`${hhmm(slot.start_time)}–${hhmm(slot.end_time)}`}</dd>
          </div>
          <div>
            <dt>Venue</dt>
            <dd>{session.venue ?? "—"}</dd>
          </div>
          <div>
            <dt>Meeting</dt>
            <dd>{session.title}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{label(slot.status ?? "booked")}</dd>
          </div>
        </dl>
      </div>
      {slot.teacher_notes ? (
        <div className="panel soft">
          <h3>Teacher’s notes</h3>
          <p>{slot.teacher_notes}</p>
        </div>
      ) : null}
      <p className="micro">
        {canCancel
          ? `You can cancel or change this booking until bookings close${session.booking_closes_at ? ` (${dateTime(session.booking_closes_at)})` : ""}.`
          : done
            ? ""
            : "Bookings for this meeting have closed, so it can no longer be cancelled in the app. Contact the school if you cannot attend."}
      </p>
      <PmError>{error}</PmError>
      {canCancel ? (
        <>
          <button className="action secondary" onClick={() => goTo(39)}>
            Book with another teacher
          </button>
          {confirming ? (
            <div className="panel soft">
              <p>{`Cancel the ${hhmm(slot.start_time)} meeting with ${teacher.teacher_name}? The time will be offered to other parents.`}</p>
              <button className="action" disabled={busy} onClick={cancel}>
                {busy ? "Cancelling…" : "Yes, cancel appointment"}
              </button>
              <button className="action secondary" disabled={busy} onClick={() => setConfirming(false)}>
                Keep appointment
              </button>
            </div>
          ) : (
            <button className="action secondary" onClick={() => setConfirming(true)}>
              Cancel appointment
            </button>
          )}
        </>
      ) : null}
    </>
  );
}
