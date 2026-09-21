"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Avatar, Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { Field, Kv, Modal, ModalActions, SearchBox, StudentPicker, formNum, formText, today, useDebounced, type PickedStudent } from "@/features/transport/kit";
import { PURPOSES, VISIT_STATUS, type FrontDeskDashboard, type GatePass, type Host, type SecurityIncident, type Visit } from "./types";

const FD = "/api/v1/school/front-desk";
const clock = (iso: string | null) => (iso ? dateTime(iso).split(", ")[1] : "—");
/** An expected visit whose host has not answered yet. */
const awaitingHost = (v: Visit) => v.status === "expected" && v.host_user_id !== null && !v.host_approved_at && !v.host_declined_reason;

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

/** SCR-226, live: GET /front-desk/dashboard, /front-desk/visits?on=today, /front-desk/gate-passes?on=today. */
export function VisitorDashboard() {
  const session = useSession();
  const dash = useApi<FrontDeskDashboard>(`${FD}/dashboard`);
  const visits = useApi<Visit[]>(`${FD}/visits`, { on: today() });
  const passes = useApi<GatePass[]>(`${FD}/gate-passes`, { on: today() });
  const d = dash.data;
  const all = visits.data ?? [];
  const now = new Date();
  const first = session?.user.full_name.split(/\s+/)[0];
  const stats = [
    { label: "Visitors today", value: d ? String(d.visitors_today) : "…", note: d ? `${d.expected_today} expected` : "Checked in today" },
    { label: "Inside campus", value: d ? String(d.inside_now) : "…", note: "Checked in, not yet out" },
    { label: "Awaiting approval", value: visits.data ? String(all.filter(awaitingHost).length) : "…", note: "Expected visitors, host not answered" },
    { label: "Gate passes pending", value: d ? String(d.gate_passes_pending) : "…", note: d ? `${d.gate_passes_today} today · ${d.open_incidents} open incident(s)` : "Early pickups" },
  ];
  const buckets = [8, 10, 12, 14, 16, 18].map((h) => ({ h, n: all.filter((v) => v.check_in_at && new Date(v.check_in_at).getHours() >= h && new Date(v.check_in_at).getHours() < h + 2).length }));
  const max = Math.max(1, ...buckets.map((b) => b.n));
  const expected = all.filter((v) => v.status === "expected").sort((a, b) => (a.expected_at ?? "").localeCompare(b.expected_at ?? ""));
  const recent = all.filter((v) => v.check_in_at).sort((a, b) => (b.check_out_at ?? b.check_in_at ?? "").localeCompare(a.check_out_at ?? a.check_in_at ?? "")).slice(0, 4);

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow">{`${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`}</div>
          <h2>{`${now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening"}${first ? `, ${first}` : ""}.`}</h2>
          <p>Here’s who is on campus and who is expected today.</p>
          <Link href={routeOf(232)} className="btn white">
            <Icon name="arrow" className="sm" />
            Open the gate log
          </Link>
        </div>
        <HeroArt />
      </section>
      <ErrorNote>{dash.error ?? visits.error}</ErrorNote>
      <StatStrip items={stats} />
      <div className="dashboard-actions">
        <span className="small strong muted">Quick actions</span>
        <div className="quick-row">
          <Link className="quick-action" href={routeOf(227)}>
            <Icon name="users" />
            Check in visitor
          </Link>
          <Link className="quick-action" href={routeOf(230)}>
            <Icon name="check" />
            Check out visitor
          </Link>
          <Link className="quick-action" href={routeOf(231)}>
            <Icon name="cap" />
            Early pickup
          </Link>
          <Link className="quick-action" href={routeOf(233)}>
            <Icon name="shield" />
            Log incident
          </Link>
        </div>
      </div>
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <Panel title="Arrivals today" sub="Check-ins in two-hour blocks">
            <svg className="chart-svg" viewBox="0 0 640 225" role="img" aria-label="Visitor check-ins today by time">
              {[0, 1, 2, 3].map((i) => (
                <Fragment key={i}>
                  <path d={`M38 ${20 + i * 51}H620`} stroke="#e9eff8" strokeDasharray="3 4" />
                  <text x="7" y={24 + i * 51} fill="#91a2ba" fontSize="10" fontFamily="Manrope">
                    {Math.round(max - (i * max) / 3)}
                  </text>
                </Fragment>
              ))}
              {buckets.map((b, i) => {
                const h = (b.n / max) * 153;
                return (
                  <Fragment key={b.h}>
                    <rect x={65 + i * 92} y={173 - h} width="31" height={h} rx="5" fill="#73a6f5" />
                    <text x={80 + i * 92} y="210" textAnchor="middle" fill="#8196b5" fontSize="10" fontFamily="Manrope">
                      {`${b.h % 12 || 12}${b.h < 12 ? "am" : "pm"}–${(b.h + 2) % 12 || 12}${b.h + 2 < 12 ? "am" : "pm"}`}
                    </text>
                  </Fragment>
                );
              })}
            </svg>
          </Panel>
        </div>
        <aside>
          <Panel title="Today’s schedule" action={<Link href={routeOf(228)} className="btn text">Approvals</Link>}>
            {expected.slice(0, 4).map((v) => (
              <div className="event-row" key={v.id}>
                <div className="event-time">
                  {clock(v.expected_at).slice(0, 5)}
                  <small style={{ display: "block", fontSize: "9px" }}>{clock(v.expected_at).slice(6)}</small>
                </div>
                <div className="event-content">
                  <h4>{PURPOSES[v.purpose]}</h4>
                  <p>{`${v.visitor_name}${v.host_name ? ` · ${v.host_name}` : ""}`}</p>
                </div>
                <Badge>{awaitingHost(v) ? "Pending" : v.host_approved_at ? "Approved" : "Expected"}</Badge>
              </div>
            ))}
            {visits.data && !expected.length ? <p className="muted">No expected visitors today.</p> : null}
          </Panel>
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <Panel title="Recent activity">
            {recent.map((v) => (
              <div className="timeline-item" key={v.id}>
                <span className="timeline-dot">
                  <Icon name={v.check_out_at ? "check" : "users"} />
                </span>
                <div>
                  <h4>{`${v.visitor_name} ${v.check_out_at ? "checked out" : "checked in"}`}</h4>
                  <p>{`${PURPOSES[v.purpose]}${v.host_name ? ` · ${v.host_name}` : ""}${v.pass_no ? ` · ${v.pass_no}` : ""}`}</p>
                </div>
                <time>{clock(v.check_out_at ?? v.check_in_at)}</time>
              </div>
            ))}
            {visits.data && !recent.length ? <p className="muted">No one has checked in today.</p> : null}
          </Panel>
        </div>
        <aside>
          <Panel title="Coming up" sub="Early pickups today">
            {(passes.data ?? []).slice(0, 4).map((g) => (
              <div className="event-row" key={g.id}>
                <div className="calendar-tile">
                  {g.leave_time ?? "—"}
                  <small>{g.status === "requested" ? "Pending" : label(g.status)}</small>
                </div>
                <div className="event-content">
                  <h4>{g.student_name}</h4>
                  <p>{`${g.pickup_name}${g.pickup_relation ? ` · ${g.pickup_relation}` : ""}`}</p>
                </div>
                <Link href={routeOf(231)} className="btn text">
                  View
                </Link>
              </div>
            ))}
            {passes.data && !passes.data.length ? <p className="muted">No early pickups today.</p> : null}
          </Panel>
        </aside>
      </div>
    </>
  );
}

const ID_TYPES = ["Aadhaar", "Driving licence", "PAN", "Passport", "Voter ID", "Employee ID", "Other"];

/** SCR-227, live: POST /front-desk/visits (walk-in, or expected with a time); hosts from /front-desk/hosts. */
export function VisitorCheckIn() {
  const router = useRouter();
  const hosts = useApi<Host[]>(`${FD}/hosts`);
  const inside = useApi<Visit[]>(`${FD}/visits`, { on: today(), inside_only: true });
  const [expected, setExpected] = useState(false);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const at = formText(f, "expected_at");
    setSaving(true);
    setError(null);
    try {
      const v = await api.post<Visit>(`${FD}/visits`, {
        visitor_name: formText(f, "visitor_name"),
        phone: formText(f, "phone"),
        id_type: formText(f, "id_type"),
        id_number: formText(f, "id_number"),
        company: formText(f, "company"),
        purpose: formText(f, "purpose"),
        purpose_detail: formText(f, "purpose_detail"),
        host_user_id: formNum(f, "host_user_id"),
        student_id: student?.id ?? null,
        people_count: formNum(f, "people_count") ?? 1,
        vehicle_no: formText(f, "vehicle_no"),
        expected_at: expected && at ? new Date(at).toISOString() : null,
        notes: formText(f, "notes"),
      });
      notify(v.status === "checked_in" ? `${v.visitor_name} checked in${v.pass_no ? ` · pass ${v.pass_no}` : ""}.` : `${v.visitor_name} expected ${dateTime(v.expected_at)}.`);
      if (v.status === "checked_in") router.push(`${routeOf(229)}?id=${v.id}&on=${today()}`);
      else router.push(routeOf(228));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="two-col">
      <form id="checkin-form" className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? hosts.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Details</h3>
              </div>
              <div className="form-grid">
                <Field label="Visitor name" required>
                  <input name="visitor_name" required placeholder="Enter visitor name" />
                </Field>
                <Field label="Mobile number" required>
                  <input type="tel" name="phone" required minLength={6} placeholder="Enter mobile number" />
                </Field>
                <Field label="Purpose" required>
                  <select name="purpose" required defaultValue="meeting">
                    {Object.entries(PURPOSES).map(([k, t]) => (
                      <option key={k} value={k}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Host">
                  <select name="host_user_id" defaultValue="">
                    <option value="">{hosts.loading ? "Loading staff…" : "No host (front office)"}</option>
                    {hosts.data?.map((h) => (
                      <option key={h.user_id} value={h.user_id}>
                        {`${h.full_name} · ${label(h.role)}`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="ID type">
                  <select name="id_type" defaultValue="">
                    <option value="">Not checked</option>
                    {ID_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="ID number">
                  <input name="id_number" placeholder="Only the last four digits are kept" autoComplete="off" />
                </Field>
                <Field label="Vehicle number">
                  <input name="vehicle_no" placeholder="e.g. KA 01 AB 1234" />
                </Field>
                <Field label="Organisation">
                  <input name="company" />
                </Field>
                <Field label="People in group">
                  <input type="number" name="people_count" min={1} max={50} defaultValue={1} />
                </Field>
                <StudentPicker label="Student visited (optional)" value={student} onChange={setStudent} />
                <Field label="Purpose details" full>
                  <input name="purpose_detail" />
                </Field>
                <label className="field">
                  <span>Arrival</span>
                  <span className="row">
                    <input type="checkbox" checked={expected} onChange={(e) => setExpected(e.target.checked)} />
                    Expected later (not here yet)
                  </span>
                </label>
                {expected ? (
                  <Field label="Expected at" required>
                    <input type="datetime-local" name="expected_at" required />
                  </Field>
                ) : null}
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : expected ? "Save expected visitor" : "Check in"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>Campus security</h3>
          <Kv
            rows={[
              ["Inside now", inside.data ? String(inside.data.length) : "…"],
              ["Date", date(today())],
            ]}
          />
          <div className="gap" />
          <p>A walk-in is checked in straight away and gets a pass number. An expected visitor waits for their host to confirm.</p>
        </div>
      </aside>
    </div>
  );
}

/** SCR-228, live: GET /front-desk/visits?on=, POST …/{id}/host-decision, …/check-in, …/deny, …/cancel. */
export function VisitorApproval() {
  const [day, setDay] = useState(today());
  const [typed, setTyped] = useState("");
  const q = useDebounced(typed.trim());
  const [show, setShow] = useState("pending");
  const visits = useApi<Visit[]>(`${FD}/visits`, { on: day, q });
  const [picked, setPicked] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const all = (visits.data ?? []).filter((v) => v.status === "expected");
  const items = all.filter((v) => (show === "pending" ? awaitingHost(v) : true));
  const sel = all.find((v) => v.id === picked) ?? null;
  const stats = [
    { label: "Awaiting review", value: visits.data ? String(all.filter(awaitingHost).length) : "…", note: "Host has not answered" },
    { label: "Approved", value: visits.data ? String(all.filter((v) => v.host_approved_at).length) : "…", note: "Expected, host confirmed" },
    { label: "Declined by host", value: visits.data ? String(all.filter((v) => v.host_declined_reason).length) : "…", note: "Front office to follow up" },
    { label: "Expected", value: visits.data ? String(all.length) : "…", note: date(day) },
  ];

  async function act(v: Visit, path: string, body: unknown, msg: string) {
    setSaving(true);
    setError(null);
    try {
      await api.post(`${FD}/visits/${v.id}/${path}`, body);
      notify(msg);
      setReason("");
      visits.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const buttons = (v: Visit) => (
    <>
      {awaitingHost(v) ? (
        <>
          <button type="button" className="btn" disabled={saving} onClick={() => act(v, "host-decision", { approved: false, reason: reason || null }, "Declined.")}>
            Decline
          </button>
          <button type="button" className="btn primary" disabled={saving} onClick={() => act(v, "host-decision", { approved: true, reason: null }, "Approved.")}>
            <Icon name="check" className="sm" />
            Approve
          </button>
        </>
      ) : (
        <button type="button" className="btn primary" disabled={saving} onClick={() => act(v, "check-in", undefined, `${v.visitor_name} checked in.`)}>
          Check in
        </button>
      )}
    </>
  );

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <SearchBox value={typed} onChange={setTyped} placeholder="Search visitor approval…" />
        <select aria-label="Filter by status" value={show} onChange={(e) => setShow(e.target.value)}>
          <option value="pending">Awaiting host</option>
          <option value="all">All expected</option>
        </select>
        <input type="date" aria-label="Date" value={day} onChange={(e) => setDay(e.target.value || today())} />
      </div>
      <ErrorNote>{error ?? visits.error}</ErrorNote>
      <div className="two-col">
        <div className="panel">
          <div className="approval-summary">
            <strong>{show === "pending" ? "Requests awaiting approval" : "Expected visitors"}</strong>
            <span>{`${items.length} shown`}</span>
          </div>
          {items.map((v, i) => (
            <article className="request-card" key={v.id}>
              <Avatar name={v.visitor_name} index={i} />
              <div className="request-info">
                <h3>{v.visitor_name}</h3>
                <p>{`${v.company ? `Organisation: ${v.company} · ` : ""}Purpose: ${PURPOSES[v.purpose]} · Host: ${v.host_name ?? "Front office"}`}</p>
                <p>{`Expected ${dateTime(v.expected_at)}${v.people_count > 1 ? ` · ${v.people_count} people` : ""}${v.host_declined_reason ? ` · Declined: ${v.host_declined_reason}` : ""}`}</p>
              </div>
              <div className="actions">
                <Badge>{awaitingHost(v) ? "Pending" : v.host_declined_reason ? "Declined" : v.host_approved_at ? "Approved" : "Expected"}</Badge>
                <button type="button" className="btn" onClick={() => setPicked(v.id)}>
                  Review
                </button>
                {buttons(v)}
              </div>
            </article>
          ))}
          {!items.length ? <div className="panel-pad muted">{visits.loading ? "Loading…" : "Nothing waiting for this day."}</div> : null}
        </div>
        <aside className="stack">
          <Panel title="Request summary">
            {sel ? (
              <>
                <Kv
                  rows={[
                    ["Visitor", sel.visitor_name],
                    ["Mobile", sel.phone],
                    ["Organisation", sel.company ?? "—"],
                    ["Purpose", `${PURPOSES[sel.purpose]}${sel.purpose_detail ? ` · ${sel.purpose_detail}` : ""}`],
                    ["Host", sel.host_name ?? "Front office"],
                    ["Student", sel.student_name ?? "—"],
                    ["Expected", dateTime(sel.expected_at)],
                    ["Vehicle", sel.vehicle_no ?? "—"],
                  ]}
                />
                <div className="gap" />
                {awaitingHost(sel) ? (
                  <Field label="Reason if declining">
                    <input value={reason} onChange={(e) => setReason(e.target.value)} />
                  </Field>
                ) : null}
                <div className="gap" />
                <div className="row">
                  {buttons(sel)}
                  <button type="button" className="btn" disabled={saving} onClick={() => act(sel, "deny", {}, "Entry denied.")}>
                    Deny entry
                  </button>
                  <button type="button" className="btn" disabled={saving} onClick={() => act(sel, "cancel", {}, "Visit cancelled.")}>
                    Cancel visit
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">Choose Review on a request to see it here.</p>
            )}
          </Panel>
          <Panel title="Approval history">
            {sel ? (
              <>
                {sel.host_approved_at ? (
                  <div className="timeline-item">
                    <span className="timeline-dot">
                      <Icon name="check" />
                    </span>
                    <div>
                      <h4>Host approved</h4>
                      <p>{sel.host_name ?? "Host"}</p>
                    </div>
                    <time>{clock(sel.host_approved_at)}</time>
                  </div>
                ) : null}
                {sel.host_declined_reason ? (
                  <div className="timeline-item">
                    <span className="timeline-dot">
                      <Icon name="message" />
                    </span>
                    <div>
                      <h4>Host declined</h4>
                      <p>{sel.host_declined_reason}</p>
                    </div>
                  </div>
                ) : null}
                {!sel.host_approved_at && !sel.host_declined_reason ? <p className="muted">No decision yet.</p> : null}
              </>
            ) : (
              <p className="muted">—</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}

/** SCR-229, live: the visit (?id=, ?on=) from GET /front-desk/visits, printed with a print-only stylesheet. */
export function VisitorPass() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const on = params.get("on") ?? today();
  const visits = useApi<Visit[]>(`${FD}/visits`, { on });
  if (visits.loading && !visits.data) return <Loading what="Loading visits…" />;
  const v = visits.data?.find((x) => String(x.id) === id);
  if (!id || !v) {
    const list = (visits.data ?? []).filter((x) => x.check_in_at);
    return (
      <>
        <ErrorNote>{visits.error ?? (id ? "That visit is not on this day's list." : null)}</ErrorNote>
        <Panel title="Choose a visitor" sub={`Checked in on ${date(on)}`} flush>
          <DataTable
            columns={["Visitor", "Pass number", "Host", "Entry time", "Status"]}
            rows={list.map((x) => [x.visitor_name, x.pass_no ?? "—", x.host_name ?? "—", clock(x.check_in_at), VISIT_STATUS[x.status]])}
            selectable={false}
            onView={(i) => router.push(`${routeOf(229)}?id=${list[i].id}&on=${on}`)}
            empty="No one has checked in on this day."
          />
        </Panel>
      </>
    );
  }
  return (
    <>
      <style>{`@media print { body * { visibility: hidden; } .visitor-card, .visitor-card * { visibility: visible; } .visitor-card { position: absolute; left: 0; top: 0; } }`}</style>
      <article className="visitor-card">
        <header>
          <h2>VISITOR PASS</h2>
          <p className="small">{v.status === "checked_out" ? "Checked out" : "Campus visitor"}</p>
        </header>
        <main>
          <span className="avatar mint large">{initials(v.visitor_name)}</span>
          <h3>{v.visitor_name}</h3>
          <Badge>{v.status === "checked_in" ? "Approved visitor" : VISIT_STATUS[v.status]}</Badge>
          <div className="gap" />
          <Kv
            rows={[
              ["Pass number", v.pass_no ?? "—"],
              ["Purpose", PURPOSES[v.purpose]],
              ["Host", v.host_name ?? "Front office"],
              ["Entry time", clock(v.check_in_at)],
              [v.check_out_at ? "Exit time" : "Date", v.check_out_at ? clock(v.check_out_at) : date(v.check_in_at)],
              ["Mobile number", v.phone],
            ]}
          />
          {/* Not wired: "valid until" — a visit has no expiry; it ends at check-out. */}
          <div className="barcode" />
          <div className="pass-code">{(v.pass_no ?? `V ${v.id}`).replace(/-/g, " ")}</div>
          <div className="gap" />
          <p className="small muted">Please return this pass when leaving campus.</p>
        </main>
      </article>
    </>
  );
}

/** Page-head print button (window.print with the pass's print stylesheet). */
export function PrintButton({ primary = false, children }: { primary?: boolean; children: string }) {
  return (
    <button type="button" className={`btn ${primary ? "primary" : ""}`} onClick={() => window.print()}>
      <Icon name="download" className="sm" />
      {children}
    </button>
  );
}

/** SCR-230, live: today's visitors inside (GET /front-desk/visits?inside_only=true), POST …/{id}/check-out. */
export function VisitorCheckOut() {
  const inside = useApi<Visit[]>(`${FD}/visits`, { on: today(), inside_only: true });
  const [pass, setPass] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = inside.data ?? [];
  const byPass = pass.trim() ? list.find((v) => (v.pass_no ?? "").toLowerCase() === pass.trim().toLowerCase()) : undefined;
  const v = byPass ?? list.find((x) => x.id === picked) ?? null;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!v) {
      setError(pass.trim() ? `No visitor inside with pass ${pass.trim()}.` : "Choose the visitor.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<Visit>(`${FD}/visits/${v.id}/check-out`);
      notify(`${r.visitor_name} checked out${r.minutes_inside !== null ? ` after ${r.minutes_inside} min` : ""}.`);
      setPass("");
      setPicked(null);
      inside.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const mins = v?.check_in_at ? Math.max(0, Math.round((Date.now() - new Date(v.check_in_at).getTime()) / 60000)) : null;
  return (
    <div className="two-col">
      <form id="checkout-form" className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? inside.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Details</h3>
              </div>
              <div className="form-grid">
                <Field label="Pass number">
                  <input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Scan or type the pass number" autoFocus />
                </Field>
                <Field label="Visitor" required>
                  <select value={v?.id ?? ""} onChange={(e) => { setPass(""); setPicked(e.target.value ? Number(e.target.value) : null); }} required>
                    <option value="">{inside.loading ? "Loading…" : list.length ? "Choose a visitor inside" : "No one is inside"}</option>
                    {list.map((x) => (
                      <option key={x.id} value={x.id}>
                        {`${x.visitor_name}${x.pass_no ? ` · ${x.pass_no}` : ""}`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Host">
                  <input value={v ? (v.host_name ?? "Front office") : ""} readOnly />
                </Field>
                <Field label="Entry time">
                  <input value={v ? clock(v.check_in_at) : ""} readOnly />
                </Field>
                <Field label="Exit time">
                  <input value="Recorded when you check out" readOnly />
                </Field>
                <Field label="Time inside">
                  <input value={mins !== null ? `${mins} min so far` : ""} readOnly />
                </Field>
                {/* Not wired: "pass returned" — the check-out records only the time. */}
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="submit" className="btn primary" disabled={saving || !v}>
              <Icon name="check" className="sm" />
              Check out visitor
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>Campus security</h3>
          <Kv
            rows={[
              ["Inside now", inside.data ? String(list.length) : "…"],
              ["Longest inside", list.length ? list.reduce((a, b) => ((a.check_in_at ?? "") < (b.check_in_at ?? "") ? a : b)).visitor_name : "—"],
            ]}
          />
          <div className="gap" />
          <p>Visitors still inside at the end of the day stay on this list until checked out.</p>
        </div>
      </aside>
    </div>
  );
}

/** SCR-231, live: GET/POST /front-desk/gate-passes, POST …/{id}/decide, POST /gate-passes/verify, POST …/{id}/release. */
export function GatePassDesk() {
  const passes = useApi<GatePass[]>(`${FD}/gate-passes`, { on: today() });
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState<GatePass | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function run<T>(fn: () => Promise<T>, msg: string) {
    setSaving(true);
    setError(null);
    try {
      const r = await fn();
      notify(msg);
      passes.reload();
      return r;
    } catch (err) {
      setError(errorText(err));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function issue(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!student) {
      setError("Choose a student.");
      return;
    }
    const f = new FormData(e.currentTarget);
    const r = await run(
      () => api.post<GatePass>(`${FD}/gate-passes`, { student_id: student.id, leave_on: formText(f, "leave_on"), leave_time: formText(f, "leave_time"), reason: formText(f, "reason"), pickup_name: formText(f, "pickup_name"), pickup_relation: formText(f, "pickup_relation"), pickup_phone: formText(f, "pickup_phone") }),
      "Gate pass requested.",
    );
    if (r) {
      setStudent(null);
      setFormKey((k) => k + 1);
    }
  }

  async function verify() {
    if (!code.trim()) return;
    const r = await run(() => api.post<GatePass>(`${FD}/gate-passes/verify`, { code: code.trim() }), "Code checked.");
    setVerified(r);
  }

  const rows: Row[] = (passes.data ?? []).map((g) => [{ name: g.student_name, sub: g.section_label ?? undefined }, `${g.pickup_name}${g.pickup_relation ? ` · ${g.pickup_relation}` : ""}`, g.leave_time ?? "—", g.reason, g.pickup_listed === false ? "Not a listed guardian" : g.pickup_listed ? "Listed guardian" : "—", g.status === "requested" ? "Pending" : label(g.status)]);
  const [open, setOpen] = useState<GatePass | null>(null);

  return (
    <>
      <div className="two-col">
        <form id="gatepass-form" className="panel" onSubmit={issue} key={formKey}>
          <div className="panel-pad">
            <ErrorNote>{!open ? error ?? passes.error : null}</ErrorNote>
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Details</h3>
                </div>
                <div className="form-grid">
                  <StudentPicker value={student} onChange={setStudent} required />
                  <Field label="Leave on" required>
                    <input type="date" name="leave_on" required defaultValue={today()} min={today()} />
                  </Field>
                  <Field label="Pickup person" required>
                    <input name="pickup_name" required placeholder="Enter pickup person" />
                  </Field>
                  <Field label="Relationship">
                    <select name="pickup_relation" defaultValue="Mother">
                      {["Mother", "Father", "Guardian", "Grandparent", "Sibling", "Relative", "Driver", "Other"].map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Pickup phone">
                    <input type="tel" name="pickup_phone" />
                  </Field>
                  <Field label="Pickup time">
                    <input type="time" name="leave_time" />
                  </Field>
                  <Field label="Reason" required full>
                    <input name="reason" required placeholder="Why the student is leaving early" />
                  </Field>
                </div>
                <p className="muted small">The pass is approved by the office below; the approved pass carries a code the gate checks at release. Whether the pickup person is a listed guardian is checked by the system.</p>
              </section>
            </div>
          </div>
          <div className="form-footer">
            <span>Fields marked * are required</span>
            <div className="actions">
              <button type="submit" className="btn primary" disabled={saving}>
                <Icon name="check" className="sm" />
                Request gate pass
              </button>
            </div>
          </div>
        </form>
        <aside className="stack">
          <div className="aside-panel">
            <h3>At the gate</h3>
            <Field label="Pass code">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code from the parent or pass" />
            </Field>
            <div className="gap" />
            <button type="button" className="btn" onClick={verify} disabled={saving || !code.trim()}>
              Verify code
            </button>
            {verified ? (
              <>
                <div className="gap" />
                <Kv
                  rows={[
                    ["Student", `${verified.student_name}${verified.section_label ? ` · ${verified.section_label}` : ""}`],
                    ["Pickup", `${verified.pickup_name}${verified.pickup_relation ? ` · ${verified.pickup_relation}` : ""}`],
                    ["Listed guardian", verified.pickup_listed ? "Yes" : verified.pickup_listed === false ? "No — check ID" : "—"],
                    ["Status", label(verified.status)],
                  ]}
                />
                {verified.status === "approved" ? (
                  <>
                    <div className="gap" />
                    <button
                      type="button"
                      className="btn primary"
                      disabled={saving}
                      onClick={async () => {
                        const r = await run(() => api.post<GatePass>(`${FD}/gate-passes/${verified.id}/release`), `${verified.student_name} released.`);
                        if (r) {
                          setVerified(null);
                          setCode("");
                        }
                      }}
                    >
                      Release student
                    </button>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </aside>
      </div>
      <div className="gap" />
      <Panel title="Today’s gate passes" flush>
        <DataTable columns={["Student", "Pickup person", "Time", "Reason", "Guardian check", "Status"]} rows={rows} selectable={false} onView={(i) => setOpen((passes.data ?? [])[i])} empty={passes.loading ? "Loading…" : "No gate passes today."} />
      </Panel>
      {open ? (
        <GatePassModal
          g={open}
          saving={saving}
          error={error}
          onClose={() => setOpen(null)}
          onDecide={async (approve, note) => {
            if (await run(() => api.post(`${FD}/gate-passes/${open.id}/decide`, { approve, note }), approve ? "Gate pass approved." : "Gate pass rejected.")) setOpen(null);
          }}
          onRelease={async () => {
            if (await run(() => api.post(`${FD}/gate-passes/${open.id}/release`), `${open.student_name} released.`)) setOpen(null);
          }}
        />
      ) : null}
    </>
  );
}

function GatePassModal({ g, saving, error, onClose, onDecide, onRelease }: { g: GatePass; saving: boolean; error: string | null; onClose: () => void; onDecide: (approve: boolean, note: string | null) => void; onRelease: () => void }) {
  const [note, setNote] = useState("");
  return (
    <Modal title={`${g.student_name} · gate pass`} onClose={onClose}>
      <ErrorNote>{error}</ErrorNote>
      <Kv
        rows={[
          ["Pickup", `${g.pickup_name}${g.pickup_relation ? ` · ${g.pickup_relation}` : ""}${g.pickup_phone ? ` · ${g.pickup_phone}` : ""}`],
          ["Listed guardian", g.pickup_listed ? "Yes" : g.pickup_listed === false ? "No" : "—"],
          ["Leaves", `${date(g.leave_on)}${g.leave_time ? ` at ${g.leave_time}` : ""}`],
          ["Reason", g.reason],
          ["Requested by", `${g.requested_by_name ?? "—"}${g.requested_by_parent ? " (parent)" : ""}`],
          ["Code", g.code ?? "Issued on approval"],
          ["Status", label(g.status)],
          ["Departed", dateTime(g.departed_at)],
        ]}
      />
      {g.status === "requested" ? (
        <>
          <div className="gap" />
          <Field label="Note">
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      ) : null}
      <div className="actions row">
        {g.status === "requested" ? (
          <>
            <button type="button" className="btn" disabled={saving} onClick={() => onDecide(false, note || null)}>
              Reject
            </button>
            <button type="button" className="btn primary" disabled={saving} onClick={() => onDecide(true, note || null)}>
              Approve
            </button>
          </>
        ) : g.status === "approved" ? (
          <button type="button" className="btn primary" disabled={saving} onClick={onRelease}>
            Release student
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </Modal>
  );
}

/** SCR-232, live: GET /front-desk/visits (on, q, inside_only) as the gate log, with a vehicle filter. */
export function GateLog() {
  const [day, setDay] = useState(today());
  const [typed, setTyped] = useState("");
  const q = useDebounced(typed.trim());
  const [only, setOnly] = useState("");
  const visits = useApi<Visit[]>(`${FD}/visits`, { on: day, q, inside_only: only === "inside" || undefined });
  const items = (visits.data ?? []).filter((v) => v.check_in_at && (only !== "vehicle" || v.vehicle_no));
  const rows: Row[] = items.map((v) => [`${v.visitor_name} · ${v.company ?? PURPOSES[v.purpose]}`, PURPOSES[v.purpose], v.vehicle_no ?? "—", clock(v.check_in_at), v.check_out_at ? clock(v.check_out_at) : "Inside", v.host_name ? `Host: ${v.host_name}` : "Front office"]);
  return (
    <>
      <div className="filterbar">
        <SearchBox value={typed} onChange={setTyped} placeholder="Search by name, phone or vehicle…" />
        <select aria-label="Filter" value={only} onChange={(e) => setOnly(e.target.value)}>
          <option value="">Everyone through the gate</option>
          <option value="vehicle">With a vehicle</option>
          <option value="inside">Still inside</option>
        </select>
        <input type="date" aria-label="Date" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())} />
      </div>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>A visit records who someone came to see, not whether they are staff, so this is the whole gate log for the day. Staff attendance is kept under HR.</span>
      </div>
      <ErrorNote>{visits.error}</ErrorNote>
      <Panel title="Gate log" sub={`${date(day)} · ${items.length} entr(ies) · ${items.filter((v) => v.vehicle_no).length} with a vehicle`} flush>
        {/* Not wired: staff entries and "recorded by" — the gate log only holds visits, and a visit does not name the guard who logged it. */}
        <DataTable columns={["Person or vehicle", "Type", "Registration", "Entry time", "Exit time", "Visiting"]} rows={rows} selectable={false} rowAction={false} empty={visits.loading ? "Loading…" : "No one through the gate on this day."} />
      </Panel>
    </>
  );
}

/** SCR-233, live: GET/POST /front-desk/incidents, PATCH /front-desk/incidents/{id} (action taken, close, severity). */
export function SecurityIncidentLog() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const adding = params.get("new") === "1";
  const [openOnly, setOpenOnly] = useState(false);
  const incidents = useApi<SecurityIncident[]>(`${FD}/incidents`, { open_only: openOnly || undefined });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = incidents.data ?? [];
  const inc = list.find((x) => String(x.id) === id) ?? (id ? null : list[0] ?? null);
  const close = () => router.replace(inc ? `${routeOf(233)}?id=${inc.id}` : routeOf(233));

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<SecurityIncident>(`${FD}/incidents`, { occurred_at: new Date(String(f.get("occurred_at"))).toISOString(), location: formText(f, "location"), category: formText(f, "category"), severity: formText(f, "severity"), description: formText(f, "description"), action_taken: formText(f, "action_taken") });
      notify("Incident logged.");
      incidents.reload();
      router.replace(`${routeOf(233)}?id=${r.id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function update(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api.patch(`${FD}/incidents/${inc!.id}`, { action_taken: formText(f, "action_taken"), severity: formText(f, "severity"), is_closed: f.get("is_closed") === "on" });
      notify("Incident updated.");
      incidents.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const now = new Date();
  const local = `${today()}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return (
    <>
      <div className="filterbar">
        <select aria-label="Filter incidents" value={openOnly ? "open" : ""} onChange={(e) => setOpenOnly(e.target.value === "open")}>
          <option value="">All incidents</option>
          <option value="open">Open only</option>
        </select>
      </div>
      <ErrorNote>{!adding ? (error ?? incidents.error) : null}</ErrorNote>
      {inc ? (
        <div className="two-col">
          <div className="stack">
            <Panel title="Case details" action={<Badge>{inc.is_closed ? "Closed" : `Open · ${label(inc.severity)}`}</Badge>}>
              <Kv
                rows={[
                  ["Incident type", label(inc.category)],
                  ["Location", inc.location ?? "—"],
                  ["Date", date(inc.occurred_at)],
                  ["Time", clock(inc.occurred_at)],
                  ["Reported by", inc.reported_by_name ?? "—"],
                  ["Description", inc.description],
                ]}
              />
            </Panel>
            <Panel title="Follow-up activity">
              {inc.is_closed ? (
                <div className="timeline-item">
                  <span className="timeline-dot">
                    <Icon name="check" />
                  </span>
                  <div>
                    <h4>Closed</h4>
                    <p>{inc.action_taken ?? "No action recorded"}</p>
                  </div>
                </div>
              ) : inc.action_taken ? (
                <div className="timeline-item">
                  <span className="timeline-dot">
                    <Icon name="file" />
                  </span>
                  <div>
                    <h4>Action taken</h4>
                    <p>{inc.action_taken}</p>
                  </div>
                </div>
              ) : null}
              <div className="timeline-item">
                <span className="timeline-dot">
                  <Icon name="calendar" />
                </span>
                <div>
                  <h4>Incident logged</h4>
                  <p>{inc.reported_by_name ?? "Security"}</p>
                </div>
                <time>{date(inc.created_at).slice(0, 6)}</time>
              </div>
            </Panel>
          </div>
          <aside className="stack">
            <form className="panel" onSubmit={update} key={`${inc.id}-${inc.action_taken}-${inc.is_closed}`}>
              <div className="panel-head">
                <div>
                  <h2>Next action</h2>
                </div>
              </div>
              <div className="panel-body">
                <div className="form-grid">
                  <Field label="Action taken" full>
                    <textarea name="action_taken" defaultValue={inc.action_taken ?? ""} />
                  </Field>
                  <Field label="Severity">
                    <select name="severity" defaultValue={inc.severity}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </Field>
                  <label className="field">
                    <span>Status</span>
                    <span className="row">
                      <input type="checkbox" name="is_closed" defaultChecked={inc.is_closed} />
                      Closed
                    </span>
                  </label>
                </div>
                <div className="gap" />
                <button type="submit" className="btn" disabled={saving}>
                  <Icon name="check" className="sm" />
                  Save
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : (
        <section className="panel">
          <div className="panel-pad muted">{incidents.loading ? "Loading incidents…" : id ? "That incident is not in this list." : "No security incidents logged."}</div>
        </section>
      )}
      <div className="gap" />
      <Panel title="All incidents" flush>
        <DataTable
          columns={["Incident type", "Location", "When", "Severity", "Reported by", "Status"]}
          rows={list.map((x) => [label(x.category), x.location ?? "—", dateTime(x.occurred_at), label(x.severity), x.reported_by_name ?? "—", x.is_closed ? "Closed" : "Open"])}
          selectable={false}
          onView={(i) => router.replace(`${routeOf(233)}?id=${list[i].id}`)}
          empty={incidents.loading ? "Loading…" : "No incidents."}
        />
      </Panel>
      {adding ? (
        <Modal title="Record incident" onClose={close}>
          <form onSubmit={create}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <Field label="Incident type" required>
                <input name="category" required list="sec-categories" placeholder="e.g. Unauthorised entry" />
                <datalist id="sec-categories">
                  {["Unauthorised entry", "Suspicious person", "Theft", "Property damage", "Medical emergency", "Fire alarm", "Lost child", "Other"].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field label="When" required>
                <input type="datetime-local" name="occurred_at" required defaultValue={local} />
              </Field>
              <Field label="Location">
                <input name="location" />
              </Field>
              <Field label="Severity">
                <select name="severity" defaultValue="low">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </Field>
              <Field label="What happened" required full>
                <textarea name="description" required />
              </Field>
              <Field label="Action taken" full>
                <textarea name="action_taken" />
              </Field>
            </div>
            <ModalActions onClose={close} saving={saving} label="Record incident" />
          </form>
        </Modal>
      ) : null}
    </>
  );
}
