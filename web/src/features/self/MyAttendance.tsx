"use client";

import { useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { KV, clock, isoDay, monthName, weekday } from "./kit";
import type { MonthHistory, StaffAttendance, StaffToday } from "./types";

const BASE = "/api/v1/staff/attendance";

/** Hours between check-in and check-out: "7h 35m". */
function worked(a: StaffAttendance): string {
  if (!a.check_in_at || !a.check_out_at) return "—";
  const mins = Math.round((new Date(a.check_out_at).getTime() - new Date(a.check_in_at).getTime()) / 60000);
  if (!(mins >= 0)) return "—";
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

/** The status the way a badge reads it. */
const statusWord = (s: string | null) => (s === "on_leave" ? "On leave" : label(s));

/**
 * NEW-090, live: GET /staff/attendance/today for today's state, POST
 * /staff/attendance/check-in and /check-out, and GET /staff/attendance/history
 * (?year=&month=) for the month's register and totals.
 */
export function MyAttendance() {
  const now = new Date();
  const thisMonth = isoDay(now).slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [y, m] = month.split("-").map(Number);
  const today = useApi<StaffToday>(`${BASE}/today`);
  const history = useApi<MonthHistory>(y && m ? `${BASE}/history` : null, { year: y, month: m });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = today.data;
  const canIn = Boolean(t && !t.is_holiday && !t.check_in_at);
  const canOut = Boolean(t && t.check_in_at && !t.check_out_at);

  async function mark(which: "check-in" | "check-out") {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<StaffAttendance>(`${BASE}/${which}`);
      notify(which === "check-in" ? `Checked in at ${clock(r.check_in_at)} · ${statusWord(r.status)}.` : `Checked out at ${clock(r.check_out_at)}.`);
      today.reload();
      if (month === thisMonth) history.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const h = history.data;
  const s = h?.summary;
  const v = (n: number | undefined) => (s ? String(n ?? 0) : "…");
  const stats = [
    { label: "Present", value: v(s?.present), note: `On time in ${monthName(month)}` },
    { label: "Late", value: v(s?.late), note: "Checked in after the start time" },
    { label: "On leave", value: s ? String(s.on_leave + s.sick) : "…", note: "Leave and sick days" },
    { label: "Absent", value: v(s?.absent), note: `${s ? s.total_days : "…"} day(s) recorded` },
  ];

  const records = [...(h?.records ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const rows: Row[] = records.map((r) => [
    date(r.date),
    weekday(r.date),
    clock(r.check_in_at),
    clock(r.check_out_at),
    worked(r),
    statusWord(r.status),
    r.manually_overridden ? `Set by the office${r.override_remark ? ` · ${r.override_remark}` : ""}` : "—",
  ]);

  const months = Array.from({ length: 12 }, (_, i) => isoDay(new Date(now.getFullYear(), now.getMonth() - i, 1)).slice(0, 7));

  let todayLine = "Loading…";
  if (t) {
    if (t.is_holiday) todayLine = `Today is a holiday${t.holiday_name ? ` (${t.holiday_name})` : ""}. No check-in is needed.`;
    else if (!t.check_in_at) todayLine = t.school_start_time ? `Check in before ${t.school_start_time} to be marked on time.` : "You have not checked in yet.";
    else if (!t.check_out_at) todayLine = "Remember to check out when you leave.";
    else todayLine = "You are done for the day.";
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="two-col">
        <div className="stack">
          <div className="filterbar">
            <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((mm) => (
                <option key={mm} value={mm}>
                  {monthName(mm)}
                </option>
              ))}
            </select>
          </div>
          <ErrorNote>{history.error}</ErrorNote>
          <Panel title={`My attendance · ${monthName(month)}`} sub={`Your check-in register${history.loading ? " · Loading…" : ""}`} flush>
            <DataTable
              columns={["Date", "Day", "Checked in", "Checked out", "Hours", "Status", "Remark"]}
              rows={rows}
              selectable={false}
              rowAction={false}
              empty={history.loading ? "Loading…" : `Nothing recorded for ${monthName(month)}.`}
            />
          </Panel>
        </div>
        <aside className="stack">
          <section className="aside-panel">
            <h3>{`Today · ${t ? date(t.date) : date(isoDay(now))}`}</h3>
            <p>{todayLine}</p>
            <ErrorNote>{error ?? today.error}</ErrorNote>
            {t ? (
              <KV
                rows={[
                  ["Status", t.is_holiday ? <Badge tone="neutral">Holiday</Badge> : t.status ? <Badge>{statusWord(t.status)}</Badge> : <Badge tone="warn">Not checked in</Badge>],
                  ["Checked in", clock(t.check_in_at)],
                  ["Checked out", clock(t.check_out_at)],
                  ...(t.manually_overridden ? ([["Set by the office", t.override_remark ?? "—"]] as [string, string][]) : []),
                ]}
              />
            ) : null}
            <div className="row" style={{ marginTop: 16, gap: 8 }}>
              <button type="button" className="btn primary" disabled={busy || !canIn} onClick={() => mark("check-in")}>
                <Icon name="clock" className="sm" />
                {busy && canIn ? "Checking in…" : "Check in"}
              </button>
              <button type="button" className="btn" disabled={busy || !canOut} onClick={() => mark("check-out")}>
                <Icon name="logout" className="sm" />
                {busy && canOut ? "Checking out…" : "Check out"}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
