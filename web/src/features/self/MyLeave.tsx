"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, KV, confirmed, isoDay, num, usePageAction } from "./kit";
import type { LeaveBalance, LeaveKind, LeaveType, StaffLeave } from "./types";

const BASE = "/api/v1/staff/leaves";
const KINDS: LeaveKind[] = ["casual", "sick", "earned", "unpaid", "other"];

type Editing = { leave: StaffLeave | null } | null;

/**
 * NEW-091, live: GET /staff/leaves (my applications), /staff/leaves/balances
 * (?year=) and /staff/leaves/types; POST /staff/leaves to apply, PATCH
 * /staff/leaves/{id} to change a pending one, POST /staff/leaves/{id}/cancel.
 */
export function MyLeave() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [status, setStatus] = useState("");
  const leaves = useApi<StaffLeave[]>(BASE);
  const balances = useApi<LeaveBalance[]>(`${BASE}/balances`, { year });
  const types = useApi<LeaveType[]>(`${BASE}/types`);
  const [editing, setEditing] = useState<Editing>(null);
  const [viewing, setViewing] = useState<StaffLeave | null>(null);
  const [error, setError] = useState<string | null>(null);

  usePageAction(
    "apply",
    useCallback(() => setEditing({ leave: null }), []),
  );

  const all = useMemo(() => leaves.data ?? [], [leaves.data]);
  const typeName = useMemo(() => new Map((types.data ?? []).map((t) => [t.id, t.name])), [types.data]);
  const inYear = all.filter((l) => l.from_date.startsWith(String(year)) || l.to_date.startsWith(String(year)));
  const items = inYear.filter((l) => !status || l.status === status);
  const ready = leaves.data !== null;
  const sumDays = (s: string) => inYear.filter((l) => l.status === s).reduce((n, l) => n + l.days, 0);
  const bal = balances.data ?? [];
  const stats = [
    {
      label: "Days available",
      value: balances.data ? (bal.length ? num(bal.reduce((n, b) => n + Number(b.available), 0)) : "—") : "…",
      note: bal.length ? `Across ${bal.length} leave type(s)` : "No entitlement allotted yet",
    },
    { label: "Days taken", value: ready ? String(sumDays("approved")) : "…", note: `Approved in ${year}` },
    { label: "Pending", value: ready ? String(inYear.filter((l) => l.status === "pending").length) : "…", note: "Waiting for a decision" },
    { label: "Rejected", value: ready ? String(inYear.filter((l) => l.status === "rejected").length) : "…", note: `Applications in ${year}` },
  ];

  const kindText = (l: StaffLeave) => (l.leave_type_id ? (typeName.get(l.leave_type_id) ?? label(l.kind)) : label(l.kind));
  const rows: Row[] = items.map((l) => [
    kindText(l),
    date(l.from_date),
    date(l.to_date),
    String(l.days),
    l.reason ?? "—",
    date(l.created_at),
    label(l.status),
  ]);

  async function cancel(l: StaffLeave) {
    if (!confirmed(`Cancel your leave from ${date(l.from_date)} to ${date(l.to_date)}?`)) return;
    setError(null);
    try {
      await api.post(`${BASE}/${l.id}/cancel`);
      notify("Leave application cancelled.");
      setViewing(null);
      leaves.reload();
      balances.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const saved = (msg: string) => {
    notify(msg);
    setEditing(null);
    leaves.reload();
    balances.reload();
  };

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((yy) => (
            <option key={yy} value={yy}>
              {yy}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <ErrorNote>{error ?? leaves.error}</ErrorNote>
      <div className="two-col">
        <div className="stack">
          <Panel title={`My leave applications · ${year}`} sub={`Newest first${leaves.loading ? " · Loading…" : ""}`} flush>
            <DataTable
              columns={["Leave type", "From", "To", "Days", "Reason", "Applied on", "Status"]}
              rows={rows}
              selectable={false}
              actions={(i) => {
                const l = items[i];
                return (
                  <>
                    <button type="button" className="btn" onClick={() => setViewing(l)}>
                      View
                    </button>
                    {l.status === "pending" ? (
                      <>
                        <button type="button" className="btn" onClick={() => setEditing({ leave: l })}>
                          Change
                        </button>
                        <button type="button" className="btn" onClick={() => cancel(l)}>
                          Cancel
                        </button>
                      </>
                    ) : null}
                  </>
                );
              }}
              empty={leaves.loading ? "Loading…" : all.length ? "No application matches these filters." : "You have not applied for leave yet."}
            />
          </Panel>
        </div>
        <aside className="stack">
          <Panel title={`My balance · ${year}`} sub="Allotted by the school office">
            <ErrorNote>{balances.error}</ErrorNote>
            {bal.length ? (
              <div className="progress-stack">
                {bal.map((b) => {
                  const total = Number(b.allotted) + Number(b.carried_forward) + Number(b.adjustment);
                  const used = Number(b.used);
                  return (
                    <div key={b.id}>
                      <div className="progress-label">
                        <span>{`${b.leave_type_name}${b.is_paid ? "" : " (unpaid)"}`}</span>
                        <strong>{`${num(b.available)} of ${num(total)} left`}</strong>
                      </div>
                      <div className="bar-track">
                        <i style={{ width: `${total > 0 ? Math.min(100, (used / total) * 100) : 0}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted">{balances.loading ? "Loading…" : `No leave has been allotted to you for ${year}. You can still apply; the office decides.`}</p>
            )}
          </Panel>
        </aside>
      </div>

      {editing ? (
        <LeaveForm
          leave={editing.leave}
          types={(types.data ?? []).filter((t) => t.is_active)}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      ) : null}

      <Dialog
        open={viewing !== null}
        title={viewing ? `${kindText(viewing)} · ${viewing.days} day(s)` : "Leave"}
        onClose={() => setViewing(null)}
        actions={
          <>
            {viewing?.status === "pending" ? (
              <button type="button" className="btn" onClick={() => viewing && cancel(viewing)}>
                Cancel application
              </button>
            ) : null}
            <button type="button" className="btn primary" onClick={() => setViewing(null)}>
              Close
            </button>
          </>
        }
      >
        {viewing ? (
          <KV
            rows={[
              ["Dates", `${date(viewing.from_date)} – ${date(viewing.to_date)}`],
              ["Reason", viewing.reason ?? "—"],
              ["Applied", dateTime(viewing.created_at)],
              ["Status", label(viewing.status)],
              ["Decided by", viewing.decided_by_name ? `${viewing.decided_by_name} · ${dateTime(viewing.decided_at)}` : "—"],
              ["Remark", viewing.decision_remark ?? "—"],
            ]}
          />
        ) : null}
      </Dialog>
    </>
  );
}

/** Apply (POST /staff/leaves) or change a pending application (PATCH /staff/leaves/{id}). */
function LeaveForm({ leave, types, onClose, onSaved }: { leave: StaffLeave | null; types: LeaveType[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [typeId, setTypeId] = useState(leave?.leave_type_id ? String(leave.leave_type_id) : types[0] ? String(types[0].id) : "");
  const [kind, setKind] = useState<LeaveKind>(leave?.kind ?? "casual");
  const [from, setFrom] = useState(leave?.from_date ?? isoDay());
  const [to, setTo] = useState(leave?.to_date ?? isoDay());
  const [reason, setReason] = useState(leave?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(_e: FormEvent<HTMLFormElement>) {
    if (to < from) {
      setError("The last day can't be before the first.");
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      leave_type_id: typeId ? Number(typeId) : null,
      from_date: from,
      to_date: to,
      reason: reason.trim() || null,
    };
    try {
      if (leave) {
        await api.patch(`${BASE}/${leave.id}`, body);
        onSaved("Leave application updated.");
      } else {
        await api.post(`${BASE}`, { ...body, kind: types.find((t) => String(t.id) === typeId)?.kind ?? kind });
        onSaved("Leave applied for. You will be told when it is decided.");
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const picked = types.find((t) => String(t.id) === typeId);
  const days = from && to && to >= from ? Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1 : 0;

  return (
    <Dialog
      open
      title={leave ? "Change my leave" : "Apply for leave"}
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            <Icon name="check" className="sm" />
            {busy ? "Saving…" : leave ? "Save changes" : "Apply"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <div className="form-grid">
        {types.length ? (
          <Field label="Leave type" required full>
            <select required value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {`${t.name}${t.is_paid ? "" : " (unpaid)"}`}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Kind of leave" required full>
            <select required value={kind} onChange={(e) => setKind(e.target.value as LeaveKind)} disabled={Boolean(leave)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {label(k)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="From" required>
          <input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" required>
          <input type="date" required min={from} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Reason" full>
          <textarea maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why you need the leave" />
        </Field>
      </div>
      <p className="small muted">
        {`${days ? `${days} calendar day(s).` : ""}${picked?.document_after_days ? ` A supporting document is needed for more than ${picked.document_after_days} day(s).` : ""} You can change or cancel the application until it is decided.`}
      </p>
    </Dialog>
  );
}
