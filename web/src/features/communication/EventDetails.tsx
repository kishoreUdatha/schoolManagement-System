"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { FileCards } from "@/components/ui/Attachments";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel, Person } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { type Register, type SchoolEvent, eventStatus, hhmm } from "./shared";

const WEEKDAY = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTH = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

/**
 * SCR-248, live: the event (from GET /api/v1/school/events) and its register
 * (GET/POST /api/v1/school/event-ops/events/{id}/register). Consent and
 * attendance sit side by side; neither is inferred from the other, and an
 * unticked child is uncounted, not absent.
 */
export function EventDetails() {
  const id = useSearchParams().get("id");
  const list = useApi<SchoolEvent[]>(id ? "/api/v1/school/events" : null);
  const reg = useApi<Register>(id ? `/api/v1/school/event-ops/events/${id}/register` : null);
  const [edits, setEdits] = useState<Record<number, { attended: boolean; note: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ev = useMemo(() => list.data?.find((e) => String(e.id) === id) ?? null, [list.data, id]);
  const rows = reg.data?.rows ?? [];
  const stateOf = (r: Register["rows"][number]) => edits[r.student_id] ?? { attended: r.attended ?? false, note: r.note ?? "" };
  const dirty = rows.filter((r) => {
    const x = edits[r.student_id];
    return x && (x.attended !== r.attended || (x.note || "") !== (r.note || ""));
  });

  if (!id) return <PickFirst what="event" href={routeOf(246)} cta="Open the events calendar" />;
  if (list.loading && !list.data) return <Loading what="Loading the event…" />;
  if (!ev) return <ErrorNote>{list.error ?? "This event was not found."}</ErrorNote>;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/event-ops/events/${id}/register`, {
        entries: dirty.map((r) => ({ student_id: r.student_id, attended: stateOf(r).attended, note: stateOf(r).note || null })),
      });
      notify(`${dirty.length} child(ren) counted.`);
      setEdits({});
      await reg.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  const d = new Date(ev.start_date + "T00:00:00");
  const r = reg.data;

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow">{`${WEEKDAY[d.getDay()]}, ${d.getDate()} ${MONTH[d.getMonth()]} ${d.getFullYear()}`}</div>
          <h2 style={ev.is_cancelled ? { textDecoration: "line-through" } : undefined}>{ev.title}</h2>
          <p>{`${label(ev.kind)} · ${ev.audience_label || "—"} · ${eventStatus(ev)}`}</p>
          <div className="metric-bubble">
            <span>
              <b>{r?.eligible ?? "…"}</b>
              {" eligible"}
            </span>
            <span>
              <b>{r ? (r.requires_consent ? r.consented : "—") : "…"}</b>
              {" consented"}
            </span>
            <span>
              <b>{ev.start_time ? hhmm(ev.start_time) : "All day"}</b>
              {` ${ev.venue ?? ""}`}
            </span>
          </div>
        </div>
        <HeroArt />
      </section>
      <ErrorNote>{error ?? reg.error}</ErrorNote>
      {r && r.consented_absent > 0 ? (
        <div className="tip warn" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="bell" className="sm" />
          <span>{`${r.consented_absent} child(ren) whose parents said yes are marked as not here.`}</span>
        </div>
      ) : null}
      {r && r.came_without_consent > 0 ? (
        <div className="tip warn" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="bell" className="sm" />
          <span>{`${r.came_without_consent} child(ren) are marked as here without a consent form.`}</span>
        </div>
      ) : null}
      <div className="two-col">
        <div className="stack">
          <Panel title="Event overview">
            <p className="muted small" style={{ lineHeight: "1.9" }}>
              {ev.description || "No description was given for this event."}
            </p>
            <FileCards files={ev.attachments ?? []} pathOf={(a) => `/api/v1/school/events/${ev.id}/files/${a.id}`} onError={setError} />
          </Panel>
          <Panel
            title="Participants"
            sub={r ? `${r.attended} counted here · ${r.unmarked} not counted yet` : "Loading the register…"}
            action={
              <button type="button" className="btn primary" disabled={!dirty.length || saving} onClick={save}>
                <Icon name="check" className="sm" />
                {saving ? "Saving…" : `Save ${dirty.length || ""} change${dirty.length === 1 ? "" : "s"}`}
              </button>
            }
            flush
          >
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Class</th>
                    <th>Consent</th>
                    <th>Attended</th>
                    <th>Note</th>
                    <th>Counted by</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const s = stateOf(row);
                    return (
                      <tr key={row.student_id}>
                        <td>
                          <Person name={row.student_name} sub={row.admission_no} index={i} />
                        </td>
                        <td>{row.class_label ?? "—"}</td>
                        <td>
                          <Badge>{row.consent === "yes" ? "Yes" : row.consent === "no" ? "Declined" : r?.requires_consent ? "Pending" : "Not asked"}</Badge>
                        </td>
                        <td>
                          <label className="row" style={{ gap: 6 }}>
                            <input
                              type="checkbox"
                              checked={s.attended}
                              aria-label={`Attended: ${row.student_name}`}
                              onChange={(x) => setEdits({ ...edits, [row.student_id]: { ...s, attended: x.target.checked } })}
                            />
                            {row.attended === null ? <span className="muted">not counted</span> : row.attended ? "here" : "not here"}
                          </label>
                        </td>
                        <td>
                          <input
                            value={s.note}
                            placeholder="—"
                            aria-label={`Note for ${row.student_name}`}
                            onChange={(x) => setEdits({ ...edits, [row.student_id]: { ...s, note: x.target.value } })}
                          />
                        </td>
                        <td>{row.marked_by ? `${row.marked_by}${row.marked_at ? ` · ${row.marked_at.slice(11, 16)}` : ""}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-empty" hidden={rows.length > 0}>
              {reg.loading ? "Loading the register…" : "Nobody is eligible for this event yet."}
            </div>
            <div className="table-footer">
              <span>{`${rows.length} child(ren) on this register`}</span>
              <span className="muted small">{dirty.length ? `${dirty.length} change(s) not saved yet` : "An unticked child is uncounted, not absent"}</span>
            </div>
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Event information">
            <dl className="kv">
              <div>
                <dt>Date</dt>
                <dd>{ev.end_date !== ev.start_date ? `${date(ev.start_date)} – ${date(ev.end_date)}` : date(ev.start_date)}</dd>
              </div>
              <div>
                <dt>Start time</dt>
                <dd>{ev.start_time ? hhmm(ev.start_time) : "All day"}</dd>
              </div>
              <div>
                <dt>End time</dt>
                <dd>{ev.end_time ? hhmm(ev.end_time) : "—"}</dd>
              </div>
              <div>
                <dt>Venue</dt>
                <dd>{ev.venue ?? "—"}</dd>
              </div>
              <div>
                <dt>Audience</dt>
                <dd>{ev.audience_label || "—"}</dd>
              </div>
              <div>
                <dt>Consent</dt>
                <dd>{ev.requires_consent ? `${ev.consent_yes} yes · ${ev.consent_no} no${ev.consent_deadline ? ` · by ${date(ev.consent_deadline)}` : ""}` : "Not asked"}</dd>
              </div>
              {ev.fee_amount ? (
                <div>
                  <dt>Cost per student</dt>
                  <dd>{money(ev.fee_amount)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Coordinator</dt>
                <dd>{ev.coordinator ?? "—"}</dd>
              </div>
              <div>
                <dt>Capacity</dt>
                <dd>{ev.capacity ? `${ev.capacity} places${ev.requires_consent ? ` · ${Math.max(ev.capacity - ev.consent_yes, 0)} left` : ""}` : "No limit"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{eventStatus(ev)}</dd>
              </div>
            </dl>
            <div className="gap" />
            <Link href={`${routeOf(247)}?id=${ev.id}`} className="btn">
              <Icon name="settings" className="sm" />
              Edit event
            </Link>
          </Panel>
        </aside>
      </div>
    </>
  );
}

/** Page-head link that carries ?id= to the consent tracker. */
export function ManageParticipantsLink() {
  const id = useSearchParams().get("id");
  return (
    <Link href={id ? `${routeOf(249)}?id=${id}` : routeOf(249)} className="btn primary">
      <Icon name="arrow" className="sm" />
      Manage participants
    </Link>
  );
}
