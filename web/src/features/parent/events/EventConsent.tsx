"use client";

/*
 * PM-038 · Event & consent. One event (?id=), or, without one, the events
 * awaiting the selected child's consent. Consent is an explicit choice:
 * nothing is preselected, "give permission" needs the read-and-agree tick,
 * and the answer is recorded for the selected child only.
 */

import { useEffect, useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { fileSize, openAttachment } from "@/components/ui/Attachments";
import { api, errorText } from "@/lib/api";
import { date, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { hhmm, PmEmpty, PmError, PmLoading, useGoTo, useQueryId } from "../comms/ui";
import { EVENTS, iso, longDate, type ParentEvent } from "./common";

function since(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return iso(d);
}

export function EventConsent() {
  const { childId, child, notify } = useParent();
  const goTo = useGoTo();
  const id = useQueryId("id");
  const events = useApi<ParentEvent[]>(EVENTS, { start: since(60) });
  const [choice, setChoice] = useState<"yes" | "no" | null>(null);
  const [agree, setAgree] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  // A decision belongs to one child and one event: start again when either changes.
  useEffect(() => {
    setChoice(null);
    setAgree(false);
    setNote("");
    setChanging(false);
    setError(null);
  }, [childId, id]);

  if (!childId || (events.loading && !events.data)) return <PmLoading />;
  if (events.error) return <PmError>{events.error}</PmError>;

  const all = events.data ?? [];
  if (!id) {
    const pending = all.filter((e) => e.consent_open && e.children.some((c) => c.student_id === childId && !c.response));
    const upcoming = all.filter((e) => !pending.includes(e) && e.end_date >= iso(new Date()));
    return (
      <>
        {!pending.length && !upcoming.length ? <PmEmpty title="No events">School events for your child will appear here.</PmEmpty> : null}
        {pending.map((e) => (
          <button key={e.id} className="item" onClick={() => goTo(38, { id: e.id })}>
            <span>
              <strong>{e.title}</strong>
              <small>{`${date(e.start_date)}${e.consent_deadline ? ` · respond by ${date(e.consent_deadline)}` : ""}`}</small>
            </span>
            <span className="status amber">Consent needed</span>
          </button>
        ))}
        {upcoming.map((e) => (
          <button key={e.id} className="item" onClick={() => goTo(38, { id: e.id })}>
            <span>
              <strong>{e.title}</strong>
              <small>{`${date(e.start_date)}${e.venue ? ` · ${e.venue}` : ""}`}</small>
            </span>
            <span className="value">›</span>
          </button>
        ))}
      </>
    );
  }

  const ev = all.find((e) => e.id === id);
  if (!ev)
    return (
      <>
        <PmEmpty title="Event not found">It may have been withdrawn or is not for your child.</PmEmpty>
        <button className="action secondary" onClick={() => goTo(37)}>
          School calendar
        </button>
      </>
    );

  const mine = ev.children.find((c) => c.student_id === childId);
  const canAnswer = ev.requires_consent && ev.consent_open && Boolean(mine);
  const answered = mine?.response ?? null;
  const showForm = canAnswer && (!answered || changing);

  async function submit() {
    if (!choice || !childId || (choice === "yes" && !agree)) return;
    setBusy(true);
    setError(null);
    try {
      await api.post<ParentEvent[]>(`${EVENTS}/${ev!.id}/consent`, { student_id: childId, response: choice, note: note.trim() || null });
      notify(choice === "yes" ? "Consent given. Thank you." : "Recorded that your child will not take part.");
      setChoice(null);
      setAgree(false);
      setNote("");
      setChanging(false);
      events.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const badge = ev.is_cancelled ? (
    <span className="status amber">Cancelled</span>
  ) : !ev.requires_consent ? (
    <span className="status blue">School event</span>
  ) : answered === "yes" ? (
    <span className="status">Consent given</span>
  ) : answered === "no" ? (
    <span className="status amber">Declined</span>
  ) : ev.consent_open && mine ? (
    <span className="status amber">Consent needed</span>
  ) : (
    <span className="status blue">Consent closed</span>
  );

  return (
    <>
      {badge}
      <h1>{ev.title}</h1>
      <p className="lead">{ev.description || ev.audience_label}</p>
      {(ev.attachments ?? []).map((a) => (
        <button key={a.id} type="button" className="item" onClick={() => openAttachment(`${EVENTS}/${ev.id}/files/${a.id}`, a).catch((e) => setError(errorText(e)))}>
          <span>
            <strong>{a.file_name}</strong>
            <small>{`From the school · ${fileSize(a.size_bytes)}`}</small>
          </span>
          <span className="value">Open</span>
        </button>
      ))}
      <dl>
        <div>
          <dt>Date</dt>
          <dd>{ev.end_date !== ev.start_date ? `${longDate(ev.start_date)} – ${longDate(ev.end_date)}` : longDate(ev.start_date)}</dd>
        </div>
        {ev.start_time ? (
          <div>
            <dt>Time</dt>
            <dd>{`${hhmm(ev.start_time)}${ev.end_time ? `–${hhmm(ev.end_time)}` : ""}`}</dd>
          </div>
        ) : null}
        {ev.venue ? (
          <div>
            <dt>Venue</dt>
            <dd>{ev.venue}</dd>
          </div>
        ) : null}
        {ev.fee_amount && Number(ev.fee_amount) > 0 ? (
          <div>
            <dt>Cost</dt>
            <dd>{money(ev.fee_amount)}</dd>
          </div>
        ) : null}
        {ev.requires_consent ? (
          <div>
            <dt>Respond by</dt>
            <dd>{date(ev.consent_deadline ?? ev.start_date)}</dd>
          </div>
        ) : null}
      </dl>
      {ev.requires_consent && !mine ? <p className="micro">{`This event is not open to ${child?.full_name ?? "the selected child"}.`}</p> : null}
      {answered && !changing ? (
        <div className="panel soft">
          <p>{`${answered === "yes" ? "You gave permission" : "You declined"} for ${mine?.student_name}.${mine?.note ? ` Note: ${mine.note}` : ""}`}</p>
          {canAnswer ? (
            <button className="action secondary" onClick={() => setChanging(true)}>
              Change response
            </button>
          ) : null}
        </div>
      ) : null}
      {showForm ? (
        <>
          <fieldset style={{ border: 0, padding: 0, margin: "16px 0 0" }}>
            <legend className="micro">{`Your decision for ${child?.full_name ?? "your child"}`}</legend>
            <label className="check">
              <input type="radio" name="consent" checked={choice === "yes"} onChange={() => setChoice("yes")} />
              Give permission to participate
            </label>
            <label className="check">
              <input type="radio" name="consent" checked={choice === "no"} onChange={() => setChoice("no")} />
              Decline participation
            </label>
          </fieldset>
          {choice === "yes" ? (
            <label className="check">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              I have read the event details and give permission for my child to participate.
            </label>
          ) : null}
          {choice === "no" ? (
            <label className="field">
              Reason (optional)
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
            </label>
          ) : null}
          <PmError>{error}</PmError>
          <button className="action" disabled={busy || !choice || (choice === "yes" && !agree)} onClick={submit}>
            {busy ? "Saving…" : choice === "no" ? "Decline participation" : "Submit consent"}
          </button>
          {changing ? (
            <button className="action secondary" onClick={() => setChanging(false)}>
              Keep my earlier response
            </button>
          ) : null}
        </>
      ) : null}
    </>
  );
}
