"use client";

import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date, label, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { AttendanceSummary, OnlyStaff } from "./types";
import { downloadCsv, thisMonth } from "./util";

const COLUMNS = ["Staff member", "Days marked", "Present", "Absent", "Leave", "Attendance"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function Bars({ items }: { items: [string, number][] }) {
  return (
    <div className="bar-list">
      {items.map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          <div className="bar-track">
            <i style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
          </div>
          <strong>{pct(v, 0)}</strong>
        </div>
      ))}
    </div>
  );
}

/**
 * SCR-088, live: GET /api/v1/school/staff-ops/attendance-summary (year, month).
 * With `only` (the staff profile's Attendance tab) the month is narrowed to
 * that person and the role filter goes.
 */
export function StaffAttendanceSummary({ only }: { only?: OnlyStaff }) {
  const [month, setMonth] = useState(thisMonth());
  const [role, setRole] = useState("");
  const [y, m] = month.split("-").map(Number);
  const res = useApi<AttendanceSummary>(y && m ? "/api/v1/school/staff-ops/attendance-summary" : null, { year: y, month: m });
  const d = res.data;

  const roles = useMemo(() => Array.from(new Set((d?.staff ?? []).map((s) => s.role))), [d]);
  const list = (d?.staff ?? []).filter((s) => (!role || s.role === role) && (!only || s.user_id === only.userId));
  const marked = list.reduce((a, s) => a + s.marked, 0);
  const sum = (k: "present" | "late" | "absent" | "on_leave" | "sick") => list.reduce((a, s) => a + s[k], 0);
  const avg = list.length ? list.reduce((a, s) => a + s.percent, 0) / list.length : null;
  const period = d ? `${MONTHS[d.month - 1]} ${d.year}` : "…";
  const range = d ? `${date(d.from_date)} – ${date(d.to_date)}` : "…";

  const stats = [
    { label: "Staff in scope", value: d ? String(list.length) : "…", note: role ? label(role) : "Every role" },
    { label: "Working days", value: d ? String(d.working_days) : "…", note: "In the month" },
    { label: "Reporting period", value: d ? MONTHS[d.month - 1] : "…", note: range },
    { label: "Average attendance", value: d ? pct(avg) : "…", note: "Across the staff shown" },
  ];

  const byRole: [string, number][] = (only ? roles.filter((r) => list.some((s) => s.role === r)) : roles).map((r) => {
    const rs = list.filter((s) => s.role === r);
    return [label(r), rs.length ? rs.reduce((a, s) => a + s.percent, 0) / rs.length : 0];
  });
  const share = (v: number) => (marked ? (v / marked) * 100 : 0);

  const cells = list.map((s) => [String(s.marked), String(s.present + s.late), String(s.absent), String(s.on_leave + s.sick), pct(s.percent)]);
  const rows: Row[] = list.map((s, i) => [{ name: s.name, sub: label(s.role) }, ...cells[i]]);

  return (
    <>
      <div className="filterbar">
        {only ? null : (
          <select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {label(r)}
              </option>
            ))}
          </select>
        )}
        <input type="month" aria-label="Month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <button
          type="button"
          className="btn"
          disabled={!list.length}
          onClick={() => downloadCsv(`staff-attendance-${month}.csv`, ["Name", "Role", ...COLUMNS.slice(1)], list.map((s, i) => [s.name, s.role, ...cells[i]]))}
        >
          <Icon name="download" className="sm" />
          Export
        </button>
      </div>
      <ErrorNote>{res.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <div className="two-col" style={{ marginBottom: "20px" }}>
        <div>
          <Panel title="Attendance by role" sub={period}>
            {byRole.length ? <Bars items={byRole} /> : <p className="muted">{res.loading ? "Loading…" : "No attendance was marked in this month."}</p>}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Report scope">
            <dl className="kv">
              <div>
                <dt>Period</dt>
                <dd>{period}</dd>
              </div>
              <div>
                <dt>Date range</dt>
                <dd>{range}</dd>
              </div>
              <div>
                <dt>Days marked</dt>
                <dd>{marked.toLocaleString("en-IN")}</dd>
              </div>
              <div>
                <dt>Group by</dt>
                <dd>Staff member</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Summary" sub="Share of marked days">
            <Bars
              items={[
                ["Present", share(sum("present"))],
                ["Late", share(sum("late"))],
                ["Absent", share(sum("absent"))],
                ["On leave", share(sum("on_leave") + sum("sick"))],
              ]}
            />
          </Panel>
        </aside>
      </div>
      <Panel title="Detailed breakdown" sub="Present includes late arrivals; leave includes sick days" flush>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          selectable={false}
          rowAction={false}
          empty={res.loading ? "Loading…" : undefined}
          emptyState={{
            title: only ? `No attendance for ${only.name}` : "No attendance recorded yet",
            note: only ? `No attendance has been marked for ${only.name} in ${period}.` : `No staff attendance has been marked for ${period} yet.`,
          }}
        />
      </Panel>
    </>
  );
}
