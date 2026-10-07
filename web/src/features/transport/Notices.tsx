"use client";

/*
 * Telling families about the bus:
 *   MessageFamiliesButton  POST /transport/trips/{id}/message, or /routes/{id}/message (pick a route)
 *   BoardingNoticesSwitch  GET/PATCH /transport/settings — a notice when a child boards or is dropped
 */

import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";

const T = "/api/v1/school/transport";
const QUICK = [
  "Running about 15 minutes late today.",
  "Running about 30 minutes late today.",
  "The bus has broken down. A replacement bus is on its way.",
  "The trip is cancelled today. Please arrange to drop / collect your child.",
];

export function MessageFamiliesButton({ tripId, label = "Message families" }: { tripId?: number; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Icon name="message" className="sm" />
        {label}
      </button>
      {open ? <MessageDialog tripId={tripId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function MessageDialog({ tripId, onClose }: { tripId?: number; onClose: () => void }) {
  const routes = useApi<{ id: number; code: string; name: string; is_active: boolean; student_count: number }[]>(tripId ? null : `${T}/routes`);
  const [routeId, setRouteId] = useState("");
  const [text, setText] = useState(QUICK[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!tripId && !routeId) return setError("Choose the route.");
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ students: number; families_told: number }>(tripId ? `${T}/trips/${tripId}/message` : `${T}/routes/${routeId}/message`, { text: text.trim() });
      notify(r.students ? `Sent to ${r.families_told} famil${r.families_told === 1 ? "y" : "ies"}.` : "No students ride this, so nobody was told.");
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={tripId ? "Message the families on this trip" : "Message the families on a route"}
      onClose={onClose}
      onSubmit={send}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || text.trim().length < 3}>
            {busy ? "Sending…" : "Send"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      {!tripId ? (
        <label className="field">
          <span>Route</span>
          <select value={routeId} onChange={(e) => setRouteId(e.target.value)} required>
            <option value="">Choose a route…</option>
            {(routes.data ?? []).filter((r) => r.is_active).map((r) => (
              <option key={r.id} value={r.id}>
                {`${r.code} · ${r.name} (${r.student_count} students)`}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="field" style={{ marginTop: 8 }}>
        <span>Message</span>
        <div className="bank-acts" style={{ margin: "4px 0 6px" }}>
          {QUICK.map((q) => (
            <button key={q} type="button" className={text === q ? "btn primary" : "btn"} onClick={() => setText(q)}>
              {q.split(".")[0].replace("Running about ", "Late ").replace(" today", "")}
            </button>
          ))}
        </div>
        <textarea rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <p className="muted small">Each family with a child on {tripId ? "this trip" : "the route"} gets it in the parent app.</p>
    </Dialog>
  );
}

export function BoardingNoticesSwitch() {
  const s = useApi<{ boarding_notices: boolean }>(`${T}/settings`);
  const [busy, setBusy] = useState(false);
  if (!s.data) return null;
  async function toggle(on: boolean) {
    setBusy(true);
    try {
      await api.patch(`${T}/settings`, { boarding_notices: on });
      notify(on ? "Families will be told when their child boards or is dropped." : "Boarding notices are off.");
      s.reload();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <label className="check" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <input type="checkbox" checked={s.data.boarding_notices} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
      <span>
        Tell families when their child boards or is dropped
        <small className="muted" style={{ display: "block" }}>And when a child isn&apos;t at the stop for the morning pickup.</small>
      </span>
    </label>
  );
}
