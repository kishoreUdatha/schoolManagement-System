"use client";

/*
 * PM-052 · Hostel updates. For a hostel resident: room, warden, curfew and
 * the last week's roll calls (GET …/hostel), outing / home-leave requests
 * (GET/POST …/hostel/outings, POST …/{id}/cancel) and a complaint to the
 * warden (POST …/hostel/complaints). Day scholars see that the module does
 * not apply. A request is not permission until the warden approves it.
 */

import { useState, type FormEvent } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date, dateTime, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading, orNull, useChildPath, valueClass, type Tone } from "../support/pm";
import type { ChildHostel } from "./types";

type Outing = {
  id: number;
  kind: "outing" | "home_leave";
  leave_at: string;
  return_by: string;
  reason: string;
  escort_name: string | null;
  status: "requested" | "approved" | "rejected" | "out" | "returned" | "cancelled";
  decision_note: string | null;
  overdue?: boolean;
};

const tone: Record<Outing["status"], Tone> = { requested: "warning", approved: "good", rejected: "bad", out: "warning", returned: "", cancelled: "" };
const COMPLAINT_KINDS = ["maintenance", "food", "cleanliness", "security", "roommate", "other"];

export function HostelUpdates() {
  return (
    <ChildGate>
      <Hostel />
    </ChildGate>
  );
}

function Hostel() {
  const { notify, go } = useParent();
  const base = useChildPath("/hostel");
  const stay = useApi<ChildHostel | null>(base);
  const outings = useApi<Outing[]>(base && `${base}/outings`);
  const [panel, setPanel] = useState<"none" | "outing" | "complaint">("none");
  const [f, setF] = useState({ kind: "outing", leave_at: "", return_by: "", reason: "", escort_name: "" });
  const [c, setC] = useState({ category: "maintenance", description: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (stay.loading && stay.data === null && !stay.error) return <PmLoading />;
  if (stay.error) return <PmError>{stay.error}</PmError>;
  const h = stay.data;
  if (!h) {
    return (
      <>
        <span className="status blue">Optional module</span>
        <PmEmpty title="Not staying in the hostel">Your child is not enrolled in the school hostel, so there are no hostel updates.</PmEmpty>
      </>
    );
  }

  async function requestOuting(e: FormEvent) {
    e.preventDefault();
    if (!base) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`${base}/outings`, {
        kind: f.kind,
        leave_at: new Date(f.leave_at).toISOString(),
        return_by: new Date(f.return_by).toISOString(),
        reason: f.reason.trim(),
        escort_name: orNull(f.escort_name),
      });
      notify("Request sent to the warden.");
      setF({ ...f, reason: "" });
      setPanel("none");
      outings.reload();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  async function complain(e: FormEvent) {
    e.preventDefault();
    if (!base) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`${base}/complaints`, { category: c.category, description: c.description.trim() });
      notify("Sent to the hostel warden.");
      setC({ ...c, description: "" });
      setPanel("none");
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(o: Outing) {
    if (!base || !window.confirm("Cancel this request?")) return;
    try {
      await api.post(`${base}/outings/${o.id}/cancel`);
      notify("Request cancelled.");
      outings.reload();
    } catch (e) {
      setErr(errorText(e));
    }
  }

  const rolls = h.attendance_last_7_days;
  // Newest first, as the API sends them.
  const last = rolls[0] ?? null;

  return (
    <>
      <span className="status blue">Hostel resident</span>
      <h2>Hostel information</h2>
      <dl>
        <div>
          <dt>Hostel</dt>
          <dd>{h.hostel_name}</dd>
        </div>
        <div>
          <dt>Room</dt>
          <dd>
            {h.room_no} · Bed {h.bed_label}
          </dd>
        </div>
        <div>
          <dt>Warden</dt>
          <dd>
            {h.warden_name ?? "—"}
            {h.warden_phone ? (
              <>
                {" · "}
                <a href={`tel:${h.warden_phone}`}>{h.warden_phone}</a>
              </>
            ) : null}
          </dd>
        </div>
        {h.curfew ? (
          <div>
            <dt>Curfew</dt>
            <dd>{h.curfew}</dd>
          </div>
        ) : null}
        <div>
          <dt>Latest roll call</dt>
          <dd>{last ? `${label(last.status)} · ${date(last.date)} ${label(last.session)}` : "No roll calls this week"}</dd>
        </div>
      </dl>
      <PmError>{err || outings.error}</PmError>

      {rolls.length > 1 ? (
        <section className="section">
          <h3>Roll calls, last 7 days</h3>
          {rolls.map((r, i) => (
            <div key={`${r.date}-${r.session}-${i}`} className="item">
              <span>
                <strong>{date(r.date)}</strong>
                <small>{label(r.session)}</small>
              </span>
              <span className={r.status === "present" ? "value good" : "value warning"}>{label(r.status)}</span>
            </div>
          ))}
        </section>
      ) : null}

      <section className="section">
        <h3>Outings & home leave</h3>
        {(outings.data ?? []).map((o) => (
          <div key={o.id} className="item">
            <span>
              <strong>
                {label(o.kind)} · {dateTime(o.leave_at)}
              </strong>
              <small>
                Back by {dateTime(o.return_by)} · {o.reason}
                {o.escort_name ? ` · with ${o.escort_name}` : ""}
                {o.decision_note ? ` · ${o.decision_note}` : ""}
              </small>
            </span>
            <span className={valueClass(o.overdue ? "bad" : tone[o.status])}>
              {o.overdue ? "Overdue" : label(o.status)}
              {o.status === "requested" || o.status === "approved" ? (
                <>
                  {" · "}
                  <button className="text-button" onClick={() => cancel(o)}>
                    Cancel
                  </button>
                </>
              ) : null}
            </span>
          </div>
        ))}
        {outings.data && outings.data.length === 0 ? <p className="micro">No outing requests yet.</p> : null}
      </section>

      {panel === "outing" ? (
        <form onSubmit={requestOuting}>
          <label className="field">
            Type
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              <option value="outing">Outing</option>
              <option value="home_leave">Home leave</option>
            </select>
          </label>
          <label className="field">
            Leaves at
            <input type="datetime-local" value={f.leave_at} onChange={(e) => setF({ ...f, leave_at: e.target.value })} required />
          </label>
          <label className="field">
            Returns by
            <input type="datetime-local" value={f.return_by} min={f.leave_at || undefined} onChange={(e) => setF({ ...f, return_by: e.target.value })} required />
          </label>
          <label className="field">
            Reason
            <textarea rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required minLength={3} maxLength={300} />
          </label>
          <label className="field">
            Escort (optional)
            <input type="text" value={f.escort_name} onChange={(e) => setF({ ...f, escort_name: e.target.value })} />
          </label>
          <button className="action" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send request"}
          </button>
          <button className="action secondary" type="button" onClick={() => setPanel("none")}>
            Cancel
          </button>
          <p className="micro">The warden must approve the request before your child may leave.</p>
        </form>
      ) : panel === "complaint" ? (
        <form onSubmit={complain}>
          <label className="field">
            Issue
            <select value={c.category} onChange={(e) => setC({ ...c, category: e.target.value })}>
              {COMPLAINT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {label(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Details
            <textarea rows={3} value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} required minLength={5} maxLength={2000} />
          </label>
          <button className="action" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send to warden"}
          </button>
          <button className="action secondary" type="button" onClick={() => setPanel("none")}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button className="item" onClick={() => setPanel("outing")}>
            <span>
              <strong>Outing or home leave</strong>
              <small>School approval required</small>
            </span>
            <span className="value">Request</span>
          </button>
          <button className="item" onClick={() => setPanel("complaint")}>
            <span>
              <strong>Raise a concern</strong>
              <small>Goes to the hostel warden</small>
            </span>
            <span className="value">›</span>
          </button>
          <button className="item" onClick={() => go(35)}>
            <span>
              <strong>Warden updates</strong>
              <small>Latest parent communication</small>
            </span>
            <span className="value">›</span>
          </button>
        </>
      )}
      <p className="micro">Hostel updates are shown only for hostel residents.</p>
    </>
  );
}
