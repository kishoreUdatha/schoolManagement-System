"use client";

/*
 * PM-050 · Early pickup request. Asks the school for a gate pass
 * (POST …/gate-passes). A request is not permission: the child may leave
 * only once the school approves it, and the gate still checks the collector.
 * Approved passes show the code to present at the gate.
 */

import { useState, type FormEvent } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date, dateTime, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmError, PmLoading, orNull, useChildPath, valueClass, type Tone } from "../support/pm";
import type { Guardian } from "./AuthorizedPickup";

import { ask } from "@/lib/dialog";
type Pass = {
  id: number;
  leave_on: string;
  leave_time: string | null;
  reason: string;
  pickup_name: string;
  pickup_relation: string | null;
  code: string | null;
  status: "requested" | "approved" | "rejected" | "departed" | "cancelled";
  pickup_listed: boolean | null;
  decision_note: string | null;
  departed_at: string | null;
};

const tone: Record<Pass["status"], Tone> = { requested: "warning", approved: "good", rejected: "bad", departed: "", cancelled: "" };
const statusText: Record<Pass["status"], string> = {
  requested: "Awaiting school",
  approved: "Approved",
  rejected: "Declined",
  departed: "Collected",
  cancelled: "Cancelled",
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function EarlyPickup() {
  return (
    <ChildGate>
      <Request />
    </ChildGate>
  );
}

function Request() {
  const { notify, go } = useParent();
  const base = useChildPath();
  const passes = useApi<Pass[]>(base && `${base}/gate-passes`);
  const guardians = useApi<Guardian[]>(base && `${base}/guardians`);
  const [f, setF] = useState({ leave_on: today(), leave_time: "", who: "", pickup_name: "", pickup_relation: "", pickup_phone: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const collectors = (guardians.data ?? []).filter((g) => g.can_pickup);
  const who = f.who || (collectors[0] ? String(collectors[0].guardian_id) : "other");
  const picked = collectors.find((g) => String(g.guardian_id) === who) ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!base) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`${base}/gate-passes`, {
        leave_on: f.leave_on,
        leave_time: orNull(f.leave_time),
        reason: f.reason.trim(),
        pickup_name: picked ? picked.full_name : f.pickup_name.trim(),
        pickup_relation: picked ? picked.relation : orNull(f.pickup_relation),
        pickup_phone: picked ? picked.phone : orNull(f.pickup_phone),
      });
      notify("Request sent. Wait for the school’s approval before coming.");
      setF({ ...f, reason: "", leave_time: "" });
      passes.reload();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(p: Pass) {
    if (!base || !(await ask("Cancel this pickup request?"))) return;
    try {
      await api.post(`${base}/gate-passes/${p.id}/cancel`);
      notify("Pickup request cancelled.");
      passes.reload();
    } catch (e) {
      setErr(errorText(e));
    }
  }

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PmError>{err || passes.error || guardians.error}</PmError>

      {(passes.data ?? [])
        .filter((p) => p.status === "approved")
        .map((p) => (
          <div key={`a${p.id}`} className="panel soft">
            <span className="eyebrow">APPROVED · SHOW AT THE GATE</span>
            <h2>{p.code ?? "—"}</h2>
            <p>
              {date(p.leave_on)}
              {p.leave_time ? ` at ${p.leave_time}` : ""} · {p.pickup_name}
            </p>
          </div>
        ))}

      <form onSubmit={submit}>
        <label className="field">
          Pickup date
          <input type="date" value={f.leave_on} min={today()} onChange={set("leave_on")} required />
        </label>
        <label className="field">
          Pickup time
          <input type="time" value={f.leave_time} onChange={set("leave_time")} />
        </label>
        <label className="field">
          Who will collect the child?
          <select value={who} onChange={set("who")}>
            {collectors.map((g) => (
              <option key={g.guardian_id} value={g.guardian_id}>
                {g.full_name} · {label(g.relation)}
              </option>
            ))}
            <option value="other">Someone else</option>
          </select>
        </label>
        {!picked ? (
          <>
            <label className="field">
              Collector’s name
              <input type="text" value={f.pickup_name} onChange={set("pickup_name")} required maxLength={160} />
            </label>
            <label className="field">
              Relationship
              <input type="text" value={f.pickup_relation} onChange={set("pickup_relation")} />
            </label>
            <label className="field">
              Collector’s phone
              <input type="tel" value={f.pickup_phone} onChange={set("pickup_phone")} />
            </label>
          </>
        ) : null}
        <label className="field">
          Reason
          <textarea rows={3} placeholder="Why is early pickup needed?" value={f.reason} onChange={set("reason")} required minLength={3} maxLength={300} />
        </label>
        <button className="action" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Request early pickup"}
        </button>
      </form>
      <p className="micro">
        Sending a request is not permission. The school must approve it and will verify the collector at the gate.
      </p>
      {!picked ? (
        <button className="action secondary" onClick={() => go(49)}>
          Manage authorized pickup people
        </button>
      ) : null}

      <section className="section">
        <h3>Your requests</h3>
        {passes.loading && !passes.data ? <PmLoading /> : null}
        {passes.data && passes.data.length === 0 ? <p className="micro">No early pickup requests yet.</p> : null}
        {(passes.data ?? []).map((p) => (
          <div key={p.id} className="item">
            <span>
              <strong>
                {date(p.leave_on)}
                {p.leave_time ? ` · ${p.leave_time}` : ""}
              </strong>
              <small>
                {p.pickup_name}
                {p.pickup_listed === false ? " (not on pickup list)" : ""} · {p.reason}
                {p.decision_note ? ` · ${p.decision_note}` : ""}
                {p.departed_at ? ` · Left ${dateTime(p.departed_at)}` : ""}
              </small>
            </span>
            <span className={valueClass(tone[p.status])}>
              {statusText[p.status]}
              {p.status === "requested" || p.status === "approved" ? (
                <>
                  {" · "}
                  <button className="text-button" onClick={() => cancel(p)}>
                    Cancel
                  </button>
                </>
              ) : null}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}
