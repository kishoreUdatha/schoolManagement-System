"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { type ConsentReport, type ParentEvent, type SchoolEvent, hhmm, isoDay, useRole, useWindowEvent } from "./shared";

import { ask, askText } from "@/lib/dialog";
export const CONSENT_REQUEST_EVENT = "comm:consent-request";

/** SCR-249: parents answer for their children; staff see the tracker. */
export function FieldTripConsent() {
  const role = useRole();
  if (role === null) return <Loading />;
  return role === "parent" ? <ParentConsent /> : <ConsentTracker />;
}

/**
 * Staff view, live: GET /api/v1/school/events (the events that ask for
 * consent) and GET /events/{id}/consents. "Send consent request" is the
 * event's publish (POST /events/{id}/publish), which notifies the audience;
 * there is no separate reminder endpoint.
 */
function ConsentTracker() {
  const router = useRouter();
  const idParam = useSearchParams().get("id");
  const events = useApi<SchoolEvent[]>("/api/v1/school/events");
  const consentEvents = useMemo(() => (events.data ?? []).filter((e) => e.requires_consent), [events.data]);
  const [eventId, setEventId] = useState<string>(idParam ?? "");
  const [typed, setTyped] = useState("");
  const [cls, setCls] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (eventId || !consentEvents.length) return;
    const today = isoDay(new Date());
    setEventId(String((consentEvents.find((e) => e.end_date >= today) ?? consentEvents[consentEvents.length - 1]).id));
  }, [consentEvents, eventId]);

  const report = useApi<ConsentReport>(eventId ? `/api/v1/school/events/${eventId}/consents` : null);
  const ev = report.data?.event ?? consentEvents.find((e) => String(e.id) === eventId);

  const request = useCallback(async () => {
    if (!ev) return setError("Choose an event that asks for consent first.");
    if (ev.is_cancelled) return setError("This event is cancelled.");
    if (ev.is_published) {
      notify("Parents were asked when this event was published; their answers appear below.");
      return;
    }
    if (!(await ask(`Publish "${ev.title}" and ask ${ev.audience_label || "its audience"} for consent?`))) return;
    try {
      await api.post(`/api/v1/school/events/${ev.id}/publish`);
      notify("Published. The audience has been notified and can now answer.");
      events.reload();
      report.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }, [ev, events, report]);
  useWindowEvent(CONSENT_REQUEST_EVENT, request);

  const all = report.data?.rows ?? [];
  const classes = Array.from(new Set(all.map((r) => r.class_label).filter(Boolean))) as string[];
  const q = typed.trim().toLowerCase();
  const shown = all.filter(
    (r) =>
      (!q || r.student_name.toLowerCase().includes(q) || (r.admission_no ?? "").toLowerCase().includes(q) || (r.parent_name ?? "").toLowerCase().includes(q)) &&
      (!cls || r.class_label === cls) &&
      (!answer || (answer === "pending" ? !r.response : r.response === answer)),
  );
  const rows: Row[] = shown.map((r) => [
    { name: r.student_name, sub: r.admission_no ?? undefined },
    r.class_label ?? "—",
    r.parent_name ?? "—",
    r.response === "yes" ? "Given" : r.response === "no" ? "Declined" : "Pending",
    r.responded_at ? dateTime(r.responded_at) : "—",
    r.note ?? "—",
  ]);
  const d = report.data;
  const stats = [
    { label: "Participants", value: d ? String(d.eligible) : "…", note: ev ? ev.title : "Children who may go" },
    { label: "Consent received", value: d ? String(d.yes) : "…", note: "Parents who said yes" },
    { label: "Pending", value: d ? String(d.pending) : "…", note: ev?.consent_deadline ? `Answer by ${date(ev.consent_deadline)}` : "Awaiting response" },
    { label: "Declined", value: d ? String(d.no) : "…", note: "Not participating" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by student or parent…" aria-label="Search consent" />
        </div>
        <select aria-label="Filter by class" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select aria-label="Filter by answer" value={answer} onChange={(e) => setAnswer(e.target.value)}>
          <option value="">All answers</option>
          <option value="yes">Given</option>
          <option value="pending">Pending</option>
          <option value="no">Declined</option>
        </select>
        <select
          aria-label="Event"
          value={eventId}
          onChange={(e) => {
            setEventId(e.target.value);
            router.replace(`${routeOf(249)}?id=${e.target.value}`);
          }}
        >
          {!consentEvents.length ? <option value="">No event asks for consent</option> : null}
          {consentEvents.map((e) => (
            <option key={e.id} value={e.id}>
              {`${e.title} · ${date(e.start_date)}${e.is_published ? "" : " (draft)"}`}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{error ?? events.error ?? report.error}</ErrorNote>
      {ev && !ev.is_published && !ev.is_cancelled ? (
        <div className="tip" style={{ marginBottom: 16 }}>
          <Icon name="bell" className="sm" />
          <span>This event is still a draft, so no parent has been asked yet. Send the consent request to publish it.</span>
        </div>
      ) : null}
      <Panel
        title="Parent consent tracker"
        sub={ev ? `${ev.title} · ${date(ev.start_date)}${ev.venue ? ` · ${ev.venue}` : ""}` : "Choose an event that asks for consent"}
        flush
      >
        <DataTable
          columns={["Student", "Class", "Guardian", "Consent", "Responded on", "Note"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          total={all.length}
          empty={report.loading || events.loading ? "Loading…" : !consentEvents.length ? "No event asks parents for consent yet. Tick “Parent consent required” when creating one." : "No children match these filters."}
        />
      </Panel>
    </>
  );
}

/**
 * Parent view, live: GET /api/v1/parent/me/events and
 * POST /api/v1/parent/me/events/{id}/consent for each child.
 */
function ParentConsent() {
  const since = useMemo(() => isoDay(new Date(Date.now() - 7 * 864e5)), []);
  const res = useApi<ParentEvent[]>("/api/v1/parent/me/events", { start: since });
  const [error, setError] = useState<string | null>(null);
  const items = (res.data ?? []).filter((e) => e.children.length > 0);

  async function reply(ev: ParentEvent, studentId: number, response: "yes" | "no") {
    const note = response === "no" ? (await askText("Reason (optional)")) : null;
    try {
      await api.post(`/api/v1/parent/me/events/${ev.id}/consent`, { student_id: studentId, response, note: note?.trim() || null });
      notify(response === "yes" ? "Consent given. Thank you." : "Recorded that your child will not take part.");
      res.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const answers = items.flatMap((e) => e.children);
  const stats = [
    { label: "Events", value: res.data ? String(items.length) : "…", note: "Asking for your consent" },
    { label: "Consent given", value: res.data ? String(answers.filter((c) => c.response === "yes").length) : "…", note: "Your answers" },
    { label: "Pending", value: res.data ? String(answers.filter((c) => !c.response).length) : "…", note: "Awaiting your answer" },
    { label: "Declined", value: res.data ? String(answers.filter((c) => c.response === "no").length) : "…", note: "Not participating" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <ErrorNote>{error ?? res.error}</ErrorNote>
      <Panel title="Parent consent" sub="Upcoming trips and activities that need your answer" flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Child</th>
                <th>Consent</th>
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.flatMap((ev) =>
                ev.children.map((c) => (
                  <tr key={`${ev.id}-${c.student_id}`}>
                    <td className="wrap">
                      <strong>{ev.title}</strong>
                      <small className="muted" style={{ display: "block" }}>
                        {[
                          date(ev.start_date),
                          ev.start_time ? hhmm(ev.start_time) : "All day",
                          ev.venue,
                          ev.fee_amount ? `Cost ${money(ev.fee_amount)}` : "",
                          ev.consent_deadline ? `Answer by ${date(ev.consent_deadline)}` : "",
                          label(ev.kind),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </td>
                    <td>{c.student_name}</td>
                    <td>
                      <Badge>{ev.is_cancelled ? "Cancelled" : c.response === "yes" ? "Given" : c.response === "no" ? "Declined" : "Pending"}</Badge>
                    </td>
                    <td className="right">
                      {ev.consent_open && !ev.is_cancelled ? (
                        <span className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                          <button type="button" className={`btn ${c.response === "yes" ? "primary" : ""}`} onClick={() => reply(ev, c.student_id, "yes")}>
                            I agree
                          </button>
                          <button type="button" className="btn" onClick={() => reply(ev, c.student_id, "no")}>
                            Decline
                          </button>
                        </span>
                      ) : (
                        <span className="muted small">Consent has closed</span>
                      )}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={items.length > 0}>
          {res.loading ? "Loading…" : "No upcoming event needs your consent."}
        </div>
      </Panel>
    </>
  );
}

/** Page-head button; the live panel below acts on it. */
export function ConsentRequestButton() {
  const role = useRole();
  if (role === "parent") return null;
  return (
    <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new CustomEvent(CONSENT_REQUEST_EVENT))}>
      <Icon name="check" className="sm" />
      Send consent request
    </button>
  );
}
