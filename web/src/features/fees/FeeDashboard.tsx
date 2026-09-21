"use client";

import Link from "next/link";
import { Chart } from "@/components/ui/Chart";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { date, money, pct } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useHydrated, useSession } from "@/lib/useSession";
import { lastSixMonths, modeLabel, monthLabel, monthStart, isoToday, scaled } from "./common";
import type { Collection, FinanceDashboard, Refund } from "./types";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

/**
 * SCR-154, live: GET /school/finance/dashboard (school-wide figures, ageing,
 * defaulters, month trend), /school/accounts/collections (this month's
 * receipts) and /school/fees/refunds?status=requested.
 */
export function FeeDashboard() {
  const sess = useSession();
  // Dates only in the browser, so the prerendered page never disagrees with it.
  const hydrated = useHydrated();
  const dash = useApi<FinanceDashboard>("/api/v1/school/finance/dashboard");
  const receipts = useApi<Collection[]>("/api/v1/school/accounts/collections", { from: monthStart(), to: isoToday() });
  const refunds = useApi<Refund[]>("/api/v1/school/fees/refunds", { status: "requested" });

  const d = dash.data;
  const now = new Date();
  const first = sess?.user.full_name.split(/\s+/)[0];
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const stats = [
    { label: "Collected this month", value: d ? money(d.collected_this_month) : "…", note: d ? `${money(d.collected_today)} collected today` : "School-wide" },
    { label: "Outstanding", value: d ? money(d.outstanding) : "…", note: "Across all unpaid fees" },
    { label: "Students owing", value: d ? d.students_owing.toLocaleString("en-IN") : "…", note: "With an unpaid balance" },
    { label: "Collection rate", value: d ? pct(d.collection_rate) : "…", note: d ? `Of ${money(d.raised_this_month)} raised this month` : "This month" },
  ];

  const months = hydrated ? lastSixMonths() : [];
  const byMonth = new Map((d?.by_month ?? []).map((m) => [m.month, Number(m.amount)]));
  const trend = months.map((m) => byMonth.get(m) ?? 0);

  const recent = (receipts.data ?? []).slice(0, 4);
  const pendingRefunds = refunds.data?.length ?? 0;

  return (
    <>
      <ErrorNote>{dash.error ?? receipts.error}</ErrorNote>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow">{hydrated ? `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}` : " "}</div>
          <h2>{hydrated ? (first ? `${greeting}, ${first}.` : `${greeting}.`) : "Welcome."}</h2>
          <p>Here’s where the school’s fees stand today.</p>
          <Link href="/reports-analytics/executive-analytics-dashboard" className="btn white">
            <Icon name="arrow" className="sm" />
            View school overview
          </Link>
        </div>
        <HeroArt />
      </section>
      <StatStrip items={stats} />
      <div className="dashboard-actions">
        <span className="small strong muted">Quick actions</span>
        <div className="quick-row">
          <Link className="quick-action" href={routeOf(158)}>
            <Icon name="money" />
            Collect fee
          </Link>
          <Link className="quick-action" href={routeOf(162)}>
            <Icon name="bell" />
            Outstanding dues
          </Link>
          <Link className="quick-action" href={routeOf(161)}>
            <Icon name="book" />
            Student ledger
          </Link>
          <Link className="quick-action" href={routeOf(165)}>
            <Icon name="file" />
            {pendingRefunds ? `Refunds (${pendingRefunds})` : "Refunds"}
          </Link>
        </div>
      </div>
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <Panel
            title="Fee collection trend"
            sub={d ? `Last six months · ${money(trend.reduce((a, b) => a + b, 0))} collected` : "Last six months"}
            action={
              <div className="chart-key">
                <span>Collected</span>
              </div>
            }
          >
            <Chart kind="line" labels={months.map((m) => monthLabel(m).slice(0, 3))} values={scaled(trend)} />
          </Panel>
        </div>
        <aside>
          <Panel title="Dues by age" action={<Link href={routeOf(162)} className="btn text">View all</Link>}>
            {(d?.buckets ?? []).map((b) => (
              <div className="event-row" key={b.label}>
                <div className="event-content">
                  <h4>{b.label}</h4>
                  <p>{b.label === "Not yet due" ? "Raised, not yet due" : "Past the due date"}</p>
                </div>
                <strong className="small">{money(b.amount)}</strong>
              </div>
            ))}
            {!d ? <p className="muted small">{dash.loading ? "Loading…" : "No figures."}</p> : null}
          </Panel>
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <Panel title="Recent receipts" sub="This month" action={<Link href={routeOf(170)} className="btn text">Cash book</Link>}>
            {recent.map((c) => (
              <div className="timeline-item" key={c.id}>
                <span className="timeline-dot">
                  <Icon name="money" />
                </span>
                <div>
                  <h4>{`Fee payment recorded · ${c.receipt_no}`}</h4>
                  <p>{`${c.student_name} · ${c.fee_head_name} ${c.period} · ${money(c.amount)} · ${modeLabel(c.mode)}`}</p>
                </div>
                <time>{date(c.collected_on)}</time>
              </div>
            ))}
            {!recent.length ? <p className="muted small">{receipts.loading ? "Loading…" : "No fee receipts this month yet."}</p> : null}
          </Panel>
        </div>
        <aside>
          <Panel title="Largest balances">
            {(d?.top_defaulters ?? []).slice(0, 4).map((x) => (
              <div className="event-row" key={x.student_id}>
                <div className="event-content">
                  <h4>{x.student_name}</h4>
                  <p>{`${x.section_label ?? x.admission_no} · ${money(x.owed)} · oldest ${x.oldest_days} days`}</p>
                </div>
                <Link className="btn text" href={`${routeOf(161)}?id=${x.student_id}`}>
                  View
                </Link>
              </div>
            ))}
            {d && !d.top_defaulters.length ? <p className="muted small">Nobody owes the school anything.</p> : null}
          </Panel>
        </aside>
      </div>
    </>
  );
}
