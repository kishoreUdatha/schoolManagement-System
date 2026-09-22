"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { LeaveType, StaffLeave } from "./types";
import { AVATAR_TONES } from "./ui";

import { ask } from "@/lib/dialog";
type Balance = { id: number; leave_type_id: number; leave_type_name: string; year: number; available: string; used: string; allotted: string };

const ageDays = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
const span = (l: StaffLeave) => (l.from_date === l.to_date ? date(l.from_date) : `${date(l.from_date)} – ${date(l.to_date)}`);

/**
 * SCR-182, live: GET /api/v1/school/staff-leaves (every request; the list is
 * not paged, so the counts are the school's), POST /staff-leaves/{id}/decide.
 * The review panel reads the applicant's balance from GET
 * /hr/leave-balances?year=&user_id=.
 */
export function LeaveApproval() {
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get("id") ? "" : "pending");
  const [role, setRole] = useState("");
  const [typed, setTyped] = useState("");
  const all = useApi<StaffLeave[]>("/api/v1/school/staff-leaves");
  const types = useApi<LeaveType[]>("/api/v1/school/hr/leave-types");
  const [selected, setSelected] = useState<number | null>(params.get("id") ? Number(params.get("id")) : null);
  const [remark, setRemark] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const everything = all.data ?? [];
  const items = useMemo(() => {
    const q = typed.trim().toLowerCase();
    return everything
      .filter((l) => (!status || l.status === status) && (!role || l.applicant_role === role) && (!q || [l.applicant_name, l.reason].some((v) => v?.toLowerCase().includes(q))))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [everything, status, role, typed]);

  useEffect(() => {
    if (items.length && !items.some((l) => l.id === selected)) setSelected(items[0].id);
  }, [items, selected]);

  const current = everything.find((l) => l.id === selected) ?? null;
  const year = current ? Number(current.from_date.slice(0, 4)) : null;
  const balances = useApi<Balance[]>(current ? "/api/v1/school/hr/leave-balances" : null, { year, user_id: current?.applicant_user_id });
  const typeName = (l: StaffLeave) => types.data?.find((t) => t.id === l.leave_type_id)?.name ?? `${label(l.kind)} leave`;
  const balance = current ? balances.data?.find((b) => (current.leave_type_id ? b.leave_type_id === current.leave_type_id : b.leave_type_name.toLowerCase().includes(current.kind))) : undefined;

  const pending = everything.filter((l) => l.status === "pending");
  const weekAgo = Date.now() - 7 * 86_400_000;
  const oldest = pending.reduce<StaffLeave | null>((o, l) => (!o || l.created_at < o.created_at ? l : o), null);
  const n = (v: number) => (all.data ? String(v) : "…");
  const stats = [
    { label: "Awaiting review", value: n(pending.length), note: `${pending.reduce((t, l) => t + l.days, 0)} days requested` },
    { label: "Approved this week", value: n(everything.filter((l) => l.status === "approved" && l.decided_at && new Date(l.decided_at).getTime() >= weekAgo).length), note: "Last seven days" },
    { label: "Declined", value: n(everything.filter((l) => l.status === "rejected").length), note: "All time" },
    { label: "Oldest request", value: oldest ? `${ageDays(oldest.created_at)} days` : "—", note: oldest ? `Submitted ${date(oldest.created_at)}` : "Nothing waiting" },
  ];
  const roles = Array.from(new Set(everything.map((l) => l.applicant_role).filter(Boolean))) as string[];
  const history = everything
    .filter((l) => l.decided_at)
    .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""))
    .slice(0, 5);

  async function decide(l: StaffLeave, to: "approved" | "rejected") {
    setErr(null);
    setBusy(true);
    try {
      await api.post(`/api/v1/school/staff-leaves/${l.id}/decide`, { status: to, decision_remark: remark.trim() || null });
      notify(`${l.applicant_name ?? "Leave"} · ${to === "approved" ? "approved" : "declined"}.`);
      setRemark("");
      all.reload();
      balances.reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (current?.status === "pending") decide(current, "approved");
    else setErr("Choose a pending request to approve.");
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search leave approval…" aria-label="Search leave requests" />
        </div>
        <select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {label(r)}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["pending", "approved", "rejected", "cancelled"].map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{err ?? all.error}</ErrorNote>
      <div className="two-col">
        <div className="panel">
          <div className="approval-summary">
            <strong>{status === "pending" ? "Requests awaiting approval" : "Leave requests"}</strong>
            <span>{all.loading ? "Loading…" : `${items.length} shown`}</span>
          </div>
          {!items.length && !all.loading ? <div className="panel-pad muted">{status === "pending" ? "Nothing is waiting for a decision." : "No request matches these filters."}</div> : null}
          {items.map((l, i) => (
            <article className="request-card" key={l.id} onClick={() => setSelected(l.id)} style={l.id === selected ? { background: "var(--soft, #f5f9ff)" } : undefined}>
              <span className={`avatar ${AVATAR_TONES[i % 4]}`}>{initials(l.applicant_name ?? "?")}</span>
              <div className="request-info">
                <h3>{l.applicant_name ?? "—"}</h3>
                <p>{`Role: ${label(l.applicant_role)} · Leave type: ${typeName(l)} · Dates: ${span(l)} (${l.days} day${l.days === 1 ? "" : "s"})`}</p>
                <p>{`Submitted ${date(l.created_at)}${l.reason ? ` · ${l.reason}` : ""}`}</p>
              </div>
              <div className="actions">
                <Badge>{label(l.status)}</Badge>
                {l.status === "pending" ? (
                  <>
                    <button type="button" className="btn" disabled={busy} onClick={async (e) => { e.stopPropagation(); setSelected(l.id); if ((await ask(`Decline ${l.applicant_name}'s leave?${remark.trim() ? "" : " Add a remark in the review panel first if you want to say why."}`))) decide(l, "rejected"); }}>
                      Decline
                    </button>
                    <button type="button" className="btn primary" disabled={busy} onClick={(e) => { e.stopPropagation(); setSelected(l.id); decide(l, "approved"); }}>
                      <Icon name="check" className="sm" />
                      Approve
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        <aside className="stack">
          <form id="leave-decision" onSubmit={submit}>
            <Panel title="Review checklist" sub={current ? `${current.applicant_name ?? "—"} · ${span(current)}` : "Choose a request"}>
              {current ? (
                <>
                  <div className="checklist">
                    <div className="check-item">
                      <input type="checkbox" aria-label="Reason given" checked={Boolean(current.reason)} readOnly disabled />
                      <label>
                        Reason given
                        <small>{current.reason ?? "No reason given"}</small>
                      </label>
                    </div>
                    <div className="check-item">
                      <input type="checkbox" aria-label="Available balance" checked={balance ? Number(balance.available) >= current.days : false} readOnly disabled />
                      <label>
                        Available balance
                        <small>
                          {balances.loading
                            ? "Checking…"
                            : balance
                              ? `${Number(balance.available)} of ${Number(balance.allotted)} days left in ${balance.year} (${balance.leave_type_name}); asks for ${current.days}`
                              : `No ${year} balance recorded for this leave type`}
                        </small>
                      </label>
                    </div>
                    <div className="check-item">
                      <input type="checkbox" aria-label="Decided" checked={current.status !== "pending"} readOnly disabled />
                      <label>
                        Decision
                        <small>{current.decided_by_name ? `${label(current.status)} by ${current.decided_by_name}${current.decision_remark ? ` · ${current.decision_remark}` : ""}` : "Not yet decided"}</small>
                      </label>
                    </div>
                  </div>
                  {current.status === "pending" ? (
                    <label className="field" style={{ marginTop: 12 }}>
                      <span>Remark (optional)</span>
                      <input value={remark} maxLength={2000} onChange={(e) => setRemark(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} placeholder="Shown to the applicant" />
                    </label>
                  ) : null}
                </>
              ) : (
                <p className="muted">Nothing to review.</p>
              )}
            </Panel>
          </form>
          <Panel title="Approval history">
            {history.length ? (
              history.map((l) => (
                <div className="timeline-item" key={l.id}>
                  <span className="timeline-dot">
                    <Icon name={l.status === "approved" ? "check" : "bell"} />
                  </span>
                  <div>
                    <h4>{`${l.applicant_name ?? "—"} · ${label(l.status)}`}</h4>
                    <p>{[span(l), l.decided_by_name].filter(Boolean).join(" · ")}</p>
                  </div>
                  <time>{dateTime(l.decided_at)}</time>
                </div>
              ))
            ) : (
              <p className="muted">{all.loading ? "Loading…" : "Nothing decided yet."}</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
