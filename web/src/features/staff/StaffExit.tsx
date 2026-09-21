"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useStaffProfile } from "./StaffProfile";
import { ROLE_LABEL, type Clearance, type ClearanceItem } from "./types";

const AREA: Record<string, string> = {
  library: "Library clearance",
  store: "Store & assets returned",
  it: "IT access & devices",
  finance: "Final settlement",
  hostel: "Hostel clearance",
  transport: "Transport clearance",
  hr: "HR exit formalities",
};

/**
 * SCR-091, live: GET /staff-ops/{id}/exit; POST /staff-ops/clearances to
 * start, POST …/items/{id} to clear an area, …/complete (deactivates the
 * login) and …/cancel. It cannot complete while any area is open.
 */
export function StaffExit() {
  const { id, data: p, error: pError, loading, reload: reloadProfile } = useStaffProfile();
  const exit = useApi<Clearance | null>(id ? `/api/v1/school/staff-ops/${id}/exit` : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!id) return <PickFirst what="member of staff" href={routeOf(80)} cta="Open the staff directory" />;
  if ((loading && !p) || (exit.loading && exit.data === null && !exit.error)) return <Loading what="Loading the exit checklist…" />;
  if (!p) return <ErrorNote>{pError ?? "Staff member not found."}</ErrorNote>;

  const c = exit.data;
  const open = c?.status === "in_progress" ? c : null;
  const items = c?.items ?? [];
  const done = items.filter((i) => i.is_cleared).length;
  const share = items.length ? Math.round((done / items.length) * 100) : 0;

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      notify(message);
      exit.reload();
      reloadProfile();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function start(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    run(
      () => api.post("/api/v1/school/staff-ops/clearances", { staff_id: Number(id), last_working_day: text("last_working_day"), reason: text("reason") }),
      "Checklist started. Every area has to sign off before it can close.",
    );
  }

  const toggle = (i: ClearanceItem) =>
    run(() => api.post(`/api/v1/school/staff-ops/clearances/items/${i.id}`, { cleared: !i.is_cleared, note: null }), i.is_cleared ? `${AREA[i.area] ?? label(i.area)} reopened.` : `${AREA[i.area] ?? label(i.area)} cleared.`);

  return (
    <div className="two-col">
      <div>
        <ErrorNote>{error ?? exit.error}</ErrorNote>
        <Panel title="Employee checklist" sub={c ? `${label(c.status)}${c.last_working_day ? ` · last working day ${date(c.last_working_day)}` : ""}` : "No exit started"}>
          <div className="person">
            <span className="avatar mint">{initials(p.full_name)}</span>
            <div>
              {p.full_name}
              <small>{`${p.designation ?? ROLE_LABEL[p.role]} · ${p.employee_no}`}</small>
            </div>
          </div>
          <div className="gap" />
          {c && c.status !== "cancelled" ? (
            <div className="checklist">
              {items.map((i) => (
                <div className="check-item" key={i.id}>
                  <input type="checkbox" aria-label={AREA[i.area] ?? label(i.area)} checked={i.is_cleared} disabled={busy || !open} onChange={() => toggle(i)} />
                  <label>
                    <strong>{AREA[i.area] ?? label(i.area)}</strong>
                    <small>{i.is_cleared ? `Cleared ${dateTime(i.cleared_at)}${i.cleared_by ? ` by ${i.cleared_by}` : ""}${i.note ? ` · ${i.note}` : ""}` : "Awaiting sign-off"}</small>
                  </label>
                  <Badge>{i.is_cleared ? "Done" : "Pending"}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <form className="form-grid" onSubmit={start}>
              {c ? <p className="muted field full">The last exit checklist was cancelled. Start a new one if this person is leaving.</p> : null}
              <label className="field">
                <span>Last working day</span>
                <input type="date" name="last_working_day" />
              </label>
              <label className="field full">
                <span>Reason</span>
                <textarea name="reason" maxLength={2000} placeholder="Resignation, retirement, end of contract…" />
              </label>
              <button type="submit" className="btn primary" disabled={busy || !p.is_active}>
                <Icon name="check" className="sm" />
                Start exit checklist
              </button>
            </form>
          )}
        </Panel>
      </div>
      <aside className="stack">
        <Panel title="Completion">
          <div className="donut" style={{ background: `conic-gradient(#2563eb 0 ${share}%,#e9eff9 ${share}%)` }}>
            <div>
              {`${share}%`}
              <small>{`${done} of ${items.length} completed`}</small>
            </div>
          </div>
          {open ? (
            <>
              <div className="gap" />
              {open.outstanding_count ? <p className="muted">{`Still open: ${open.outstanding.map((a) => AREA[a] ?? label(a)).join(", ")}.`}</p> : null}
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !open.can_complete}
                  onClick={() =>
                    window.confirm(`Complete the exit for ${p.full_name}? Their login will be deactivated.`) &&
                    run(() => api.post(`/api/v1/school/staff-ops/clearances/${open.id}/complete`, { deactivate: true }), "Offboarding complete. The login is deactivated.")
                  }
                >
                  <Icon name="check" className="sm" />
                  Complete offboarding
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => window.confirm("Cancel this exit checklist?") && run(() => api.post(`/api/v1/school/staff-ops/clearances/${open.id}/cancel`), "Exit checklist cancelled.")}
                >
                  Cancel exit
                </button>
              </div>
            </>
          ) : c?.status === "complete" ? (
            <p className="muted">{`Completed ${dateTime(c.completed_at)}.`}</p>
          ) : null}
        </Panel>
        <Panel title="Employee details">
          <dl className="kv">
            <div>
              <dt>Department</dt>
              <dd>{p.department_name ?? "—"}</dd>
            </div>
            <div>
              <dt>Designation</dt>
              <dd>{p.designation ?? "—"}</dd>
            </div>
            <div>
              <dt>Joining date</dt>
              <dd>{date(p.joining_date)}</dd>
            </div>
            <div>
              <dt>Initiated by</dt>
              <dd>{c?.initiated_by ?? "—"}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{c?.reason ?? "—"}</dd>
            </div>
          </dl>
        </Panel>
      </aside>
    </div>
  );
}
