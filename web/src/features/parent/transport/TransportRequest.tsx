"use client";

/*
 * PM-032 · Transport request. The child's current assignment, a request
 * form (type, effective date, requested stop, reason) sent to the school's
 * transport office (POST /parent/me/children/{id}/transport-requests; stops
 * from …/transport/stop-options), and earlier requests with their status
 * (GET /parent/me/requests?kind=transport_change). Approving a stop change
 * moves the child's assignment from the effective date.
 */

import { useState, type FormEvent } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ME, REQUEST_STATUS, type ParentRequest } from "../support/services";
import { hhmm, PmError, PmLoading } from "../comms/ui";
import { useTransport } from "./common";

type StopOption = {
  stop_id: number;
  stop_name: string;
  route_id: number;
  route_name: string;
  pickup_time: string | null;
  drop_time: string | null;
  monthly_fee: string | null;
};

const TYPES = [
  ["change_stop", "Change pickup / drop stop"],
  ["temporary_pause", "Pause transport for a while"],
  ["stop_service", "Stop using school transport"],
  ["start_service", "Start using school transport"],
] as const;
type RequestType = (typeof TYPES)[number][0];

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function TransportRequest() {
  const { childId, notify } = useParent();
  const tr = useTransport(childId);
  const stops = useApi<StopOption[]>(childId ? `${ME}/children/${childId}/transport/stop-options` : null);
  const reqs = useApi<ParentRequest[]>(childId ? `${ME}/requests` : null, { kind: "transport_change", student_id: childId });
  const [f, setF] = useState<{ request_type: RequestType | ""; effective_from: string; until: string; stop: string; reason: string }>({
    request_type: "",
    effective_from: tomorrow(),
    until: "",
    stop: "",
    reason: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!childId || tr.loading) return <PmLoading />;
  const t = tr.data;
  const types = TYPES.filter(([k]) => (t ? k !== "start_service" : k === "start_service"));
  const type: RequestType = f.request_type && types.some(([k]) => k === f.request_type) ? f.request_type : types[0][0];
  const needsStop = type === "change_stop" || type === "start_service";
  const pending = (reqs.data ?? []).some((r) => r.status === "pending");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.post(`${ME}/children/${childId}/transport-requests`, {
        request_type: type,
        effective_from: f.effective_from,
        until: type === "temporary_pause" && f.until ? f.until : null,
        requested_stop_id: needsStop && f.stop ? Number(f.stop) : null,
        reason: f.reason.trim(),
      });
      notify("Request sent to the transport office.");
      setF({ ...f, reason: "", stop: "", until: "" });
      reqs.reload();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: number) {
    try {
      await api.post(`${ME}/requests/${id}/cancel`);
      notify("Request withdrawn.");
      reqs.reload();
    } catch (e2) {
      setErr(errorText(e2));
    }
  }

  return (
    <>
      <PmError>{tr.error || err}</PmError>
      <div className="panel soft">
        <span className="eyebrow">CURRENT TRANSPORT</span>
        {t ? (
          <>
            <h3>{t.route_name}</h3>
            <p>{`Stop: ${t.stop_name}${t.pickup_time && t.direction !== "drop" ? ` · pickup ${hhmm(t.pickup_time)}` : ""}${t.drop_time && t.direction !== "pickup" ? ` · drop ${hhmm(t.drop_time)}` : ""}`}</p>
          </>
        ) : (
          <p>This child is not using school transport.</p>
        )}
      </div>
      {pending ? (
        <p className="micro">A request is waiting for the transport office. Withdraw it below to send a different one.</p>
      ) : (
        <form onSubmit={submit}>
          <label className="field">
            Request type
            <select value={type} onChange={(e) => setF({ ...f, request_type: e.target.value as RequestType })}>
              {types.map(([k, text]) => (
                <option key={k} value={k}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {type === "stop_service" ? "First day without transport" : type === "temporary_pause" ? "Pause from" : "Effective from"}
            <input type="date" min={tomorrow()} value={f.effective_from} onChange={(e) => setF({ ...f, effective_from: e.target.value })} required />
          </label>
          {type === "temporary_pause" ? (
            <label className="field">
              Until
              <input type="date" min={f.effective_from} value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} required />
            </label>
          ) : null}
          {needsStop ? (
            <label className="field">
              Requested stop
              <select value={f.stop} onChange={(e) => setF({ ...f, stop: e.target.value })} required>
                <option value="">{stops.loading ? "Loading stops…" : "Choose a stop"}</option>
                {(stops.data ?? []).map((s) => (
                  <option key={s.stop_id} value={s.stop_id} disabled={t?.stop_name === s.stop_name && t?.route_name === s.route_name}>
                    {`${s.stop_name} · ${s.route_name}${s.pickup_time ? ` · ${hhmm(s.pickup_time)}` : ""}${s.monthly_fee ? ` · ${money(s.monthly_fee)}/month` : ""}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="field">
            Reason
            <textarea rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required minLength={3} maxLength={500} placeholder="For example, we have moved house" />
          </label>
          <button className="action" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send request"}
          </button>
        </form>
      )}
      {(reqs.data ?? []).length ? (
        <section className="section">
          <h3>Your requests</h3>
          {(reqs.data ?? []).map((r) => (
            <div key={r.id} className="item">
              <span>
                <strong>{r.summary}</strong>
                <small>
                  Sent {date(r.created_at)}
                  {r.decision_note ? ` · ${r.decision_note}` : ""}
                  {r.status === "pending" ? (
                    <>
                      {" · "}
                      <button type="button" className="text-button" onClick={() => withdraw(r.id)}>
                        Withdraw
                      </button>
                    </>
                  ) : null}
                </small>
              </span>
              <span className={REQUEST_STATUS[r.status][1]}>{REQUEST_STATUS[r.status][0]}</span>
            </div>
          ))}
        </section>
      ) : null}
      <p className="micro">The current route stays active until the school approves a change.</p>
    </>
  );
}
