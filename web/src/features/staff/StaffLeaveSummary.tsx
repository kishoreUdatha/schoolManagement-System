"use client";

import { useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel, Person } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label, pct } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { LeaveBalance, OnlyStaff, StaffLeave } from "./types";
import { downloadCsv } from "./util";

const COLUMNS = ["Staff member", "Leave type", "Entitlement", "Used", "Carried forward", "Available"];

function Bars({ items }: { items: [string, number, string][] }) {
  return (
    <div className="bar-list">
      {items.map(([k, w, v]) => (
        <div key={k}>
          <span>{k}</span>
          <div className="bar-track">
            <i style={{ width: `${Math.max(0, Math.min(100, w))}%` }} />
          </div>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}

/**
 * SCR-089, live: requests and decisions (GET /staff-leaves, POST
 * /staff-leaves/{id}/decide) and balances (GET /hr/leave-balances?year=).
 * With `only` (the staff profile's Leave tab) both are narrowed to that person.
 */
export function StaffLeaveSummary({ only }: { only?: OnlyStaff }) {
  const thisYear = new Date().getFullYear();
  const [status, setStatus] = useState("");
  const [year, setYear] = useState(thisYear);
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leaves = useApi<StaffLeave[]>("/api/v1/school/staff-leaves", { status });
  const balances = useApi<LeaveBalance[]>("/api/v1/school/hr/leave-balances", { year });

  const all = (leaves.data ?? []).filter((l) => !only || l.applicant_user_id === only.userId);
  const inYear = all.filter((l) => l.from_date.startsWith(String(year)) || l.to_date.startsWith(String(year)));
  const count = (s: StaffLeave["status"]) => inYear.filter((l) => l.status === s).length;
  const approvedDays = inYear.filter((l) => l.status === "approved").reduce((a, l) => a + l.days, 0);
  const ready = Boolean(leaves.data);

  const stats = [
    { label: "Requests", value: ready ? String(inYear.length) : "…", note: `${status ? label(status) : "All"} · ${year}` },
    { label: "Pending", value: ready ? String(count("pending")) : "…", note: "Awaiting a decision" },
    { label: "Approved", value: ready ? String(count("approved")) : "…", note: `${approvedDays} days in total` },
    { label: "Rejected", value: ready ? String(count("rejected")) : "…", note: "Declined requests" },
  ];

  const byKind = Array.from(
    inYear.filter((l) => l.status === "approved").reduce((m, l) => m.set(l.kind, (m.get(l.kind) ?? 0) + l.days), new Map<string, number>()),
  );
  const maxDays = Math.max(1, ...byKind.map(([, v]) => v));
  const share = (v: number) => (inYear.length ? (v / inYear.length) * 100 : 0);

  const bal = (balances.data ?? []).filter((b) => !only || b.user_id === only.userId);
  const cells = bal.map((b) => [b.leave_type_name, `${Number(b.allotted)} days`, String(Number(b.used)), String(Number(b.carried_forward)), String(Number(b.available))]);
  const rows: Row[] = bal.map((b, i) => [{ name: b.user_name, sub: b.is_paid ? "Paid leave" : "Unpaid leave" }, ...cells[i]]);

  async function decide(l: StaffLeave, next: "approved" | "rejected") {
    setBusy(l.id);
    setError(null);
    try {
      await api.post(`/api/v1/school/staff-leaves/${l.id}/decide`, { status: next, decision_remark: remarks[l.id]?.trim() || null });
      notify(`Leave ${next} for ${l.applicant_name}.`);
      leaves.reload();
      balances.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="filterbar">
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          disabled={!bal.length}
          onClick={() => downloadCsv(`staff-leave-balances-${year}.csv`, COLUMNS, bal.map((b, i) => [b.user_name, ...cells[i]]))}
        >
          <Icon name="download" className="sm" />
          Export
        </button>
      </div>
      <ErrorNote>{error ?? leaves.error ?? balances.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <div className="two-col" style={{ marginBottom: "20px" }}>
        <div>
          <Panel title="Approved days by leave kind" sub={String(year)}>
            {byKind.length ? (
              <Bars items={byKind.map(([k, v]) => [label(k), (v / maxDays) * 100, `${v} days`])} />
            ) : (
              <p className="muted">{leaves.loading ? "Loading…" : "No approved leave in this year."}</p>
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Report scope">
            <dl className="kv">
              <div>
                <dt>Year</dt>
                <dd>{year}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{status ? label(status) : "All statuses"}</dd>
              </div>
              <div>
                <dt>Balances</dt>
                <dd>{`${bal.length} allotments`}</dd>
              </div>
              <div>
                <dt>Group by</dt>
                <dd>Staff member & leave type</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Summary" sub="Share of requests">
            <Bars
              items={(["approved", "pending", "rejected"] as const).map((s) => [label(s), share(count(s)), pct(share(count(s)), 0)])}
            />
          </Panel>
        </aside>
      </div>
      <Panel title="Leave requests" sub="Approve or reject with an optional remark" flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Staff member</th>
                <th>Leave</th>
                <th>Dates</th>
                <th>Reason</th>
                <th>Status</th>
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {inYear.map((l, i) => (
                <tr key={l.id}>
                  <td>
                    <Person name={l.applicant_name} index={i} sub={label(l.applicant_role)} />
                  </td>
                  <td>{`${label(l.kind)} · ${l.days} day${l.days === 1 ? "" : "s"}`}</td>
                  <td>{l.from_date === l.to_date ? date(l.from_date) : `${date(l.from_date)} – ${date(l.to_date)}`}</td>
                  <td className="wrap">{l.decision_remark ? `${l.reason ?? "—"} · Remark: ${l.decision_remark}` : (l.reason ?? "—")}</td>
                  <td>
                    <Badge>{label(l.status)}</Badge>
                  </td>
                  <td className="right">
                    {l.status === "pending" ? (
                      <div className="row">
                        <input
                          aria-label={`Remark for ${l.applicant_name}`}
                          placeholder="Remark (optional)"
                          value={remarks[l.id] ?? ""}
                          onChange={(e) => setRemarks({ ...remarks, [l.id]: e.target.value })}
                        />
                        <button type="button" className="btn primary" disabled={busy === l.id} onClick={() => decide(l, "approved")}>
                          Approve
                        </button>
                        <button type="button" className="btn" disabled={busy === l.id} onClick={() => decide(l, "rejected")}>
                          Reject
                        </button>
                      </div>
                    ) : (
                      <small className="muted">{l.decided_by_name ? `by ${l.decided_by_name}` : "—"}</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={inYear.length > 0}>
          {leaves.loading ? "Loading requests…" : "No leave requests match."}
        </div>
      </Panel>
      <div className="gap" />
      <Panel title="Detailed breakdown" sub={`Leave balances for ${year}`} flush>
        <DataTable columns={COLUMNS} rows={rows} selectable={false} rowAction={false} empty={balances.loading ? "Loading…" : "No leave balances allotted for this year."} />
      </Panel>
    </>
  );
}
