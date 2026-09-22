"use client";

import { Chart } from "@/components/ui/Chart";
import { StatStrip, type Stat } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { dateTime, label, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { DateRow, Empty, Hero, lastMonths, monthLabel, QuickActions, TimelineRow, TodaySchedulePanel, todayIso } from "./parts";
import type { AccountantDashboardData, CalendarItem, Refund } from "./types";

function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return todayIso(d);
}

/**
 * SCR-038, live: GET /api/v1/accountant/dashboard, GET /api/v1/school/fees/refunds,
 * GET /api/v1/school/insights/schedule/today and GET /api/v1/school/calendar (next 60 days).
 */
export function AccountantDashboard() {
  const dash = useApi<AccountantDashboardData>("/api/v1/accountant/dashboard");
  const refunds = useApi<Refund[]>("/api/v1/school/fees/refunds");
  const calendar = useApi<CalendarItem[]>("/api/v1/school/calendar", { start: todayIso(), end: inDays(60) });
  const d = dash.data;
  const all = refunds.data;
  const waiting = all?.filter((r) => r.status === "requested");
  const events = (calendar.data ?? []).filter((c) => !c.is_cancelled && !c.is_draft).slice(0, 3);
  // The day's money jobs, after whatever is timed on the calendar.
  const todo = [
    ...(waiting?.length ? [{ title: "Refund review", sub: `${waiting.length} request(s) awaiting approval` }] : []),
    ...(d && Number(d.overdue) > 0 ? [{ title: "Overdue fees", sub: `${money(d.overdue)} past its due date · ${d.families_owing} student(s) owing` }] : []),
  ];

  const stats: Stat[] = [
    { label: "Collected today", value: d ? money(d.collected_today) : "…", note: d ? `${d.receipts_today} receipt(s)` : "Today" },
    { label: "Outstanding dues", value: d ? money(d.outstanding) : "…", note: d ? `${d.families_owing} student(s) owing` : "All unpaid fees" },
    { label: "Collected this month", value: d ? money(d.collected_this_month) : "…", note: "Since the 1st" },
    { label: "Pending refunds", value: waiting ? (all && all.length >= 500 ? `${waiting.length}+` : String(waiting.length)) : "…", note: "Awaiting approval" },
  ];

  // Six months of collections; the chart is drawn on a 0–100 scale, so each month is shown against the best one.
  const months = lastMonths(6);
  const byMonth = new Map((d?.by_month ?? []).map((m) => [m.month, Number(m.amount)]));
  const amounts = months.map((m) => byMonth.get(m) ?? 0);
  const peak = Math.max(...amounts);

  const hero = !d
    ? "Money in, money owed, and what needs a decision today."
    : `${money(d.collected_today)} collected today across ${d.receipts_today} receipt(s). ${Number(d.overdue) > 0 ? `${money(d.overdue)} is overdue.` : "Nothing is overdue."}`;

  return (
    <>
      <Hero text={hero} cta={{ href: "/fees-finance/fee-collection", label: "Collect fee" }} />
      <ErrorNote>{dash.error ?? refunds.error}</ErrorNote>
      <StatStrip items={stats} />
      <QuickActions
        items={[
          ["/fees-finance/fee-collection", "money", "Collect fee"],
          ["/fees-finance/outstanding-dues", "chart", "Outstanding dues"],
          ["/fees-finance/student-ledger", "book", "Student ledger"],
          ["/fees-finance/finance-reports", "file", "Finance reports"],
        ]}
      />
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <Panel
            title="Fee collection trend"
            sub={peak > 0 ? `Last six months · % of the best month (${money(peak)})` : "Last six months"}
            action={
              <div className="chart-key">
                <span>Collected</span>
              </div>
            }
          >
            {peak > 0 ? (
              <Chart kind="line" labels={months.map(monthLabel)} values={amounts.map((a) => Math.round((a / peak) * 100))} />
            ) : (
              <Empty>{dash.loading ? "Loading…" : "No fees collected in the last six months."}</Empty>
            )}
          </Panel>
        </div>
        <aside>
          <TodaySchedulePanel href="/fees-finance/outstanding-dues" todo={todo} />
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <Panel title="Recent activity" sub="Refund requests">
            {all?.length ? (
              all.slice(0, 3).map((r) => (
                <TimelineRow
                  key={r.id}
                  icon="money"
                  title={`Refund ${label(r.status).toLowerCase()} · ${money(r.amount)}`}
                  sub={[r.student_name, r.section_label, r.fee_label].filter(Boolean).join(" · ")}
                  time={dateTime(r.created_at)}
                />
              ))
            ) : (
              <Empty>{refunds.loading ? "Loading…" : "No refund requests."}</Empty>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Coming up">
            {events.length ? (
              events.map((c) => <DateRow key={`${c.type}${c.id}`} day={c.start_date} title={c.title} sub={[label(c.type), c.start_time?.slice(0, 5), c.detail].filter(Boolean).join(" · ")} />)
            ) : (
              <Empty>{calendar.loading ? "Loading…" : (calendar.error ?? "Nothing on the school calendar in the next 60 days.")}</Empty>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
