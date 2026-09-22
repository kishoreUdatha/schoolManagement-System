"use client";

import Link from "next/link";
import { Chart } from "@/components/ui/Chart";
import { type IconName } from "@/components/ui/Icon";
import { StatStrip, type Stat } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { dateTime, label } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Empty, Hero, monthLabel, QuickActions, TimelineRow, TodaySchedulePanel } from "./parts";
import type { InboxItem, StaffDashboardData } from "./types";

/*
 * HR, admissions, transport and library are not separate logins: they are
 * jobs (hr.manage, admissions.manage …) handed to a staff member, and
 * GET /api/v1/staff/dashboard returns one panel per job held, each with six
 * months of its workload. Each of these dashboards shows its own panel and
 * trend, today's schedule (GET /api/v1/school/insights/schedule/today) with
 * the to-do lines of every job the person holds, and their inbox.
 */

type Config = {
  panel: string;
  permission: string;
  job: string;
  cta: { href: string; label: string };
  actions: [string, IconName, string][];
};

type StaffToday = { date: string; has_record: boolean; check_in_at: string | null; check_out_at: string | null; status: string | null; is_holiday: boolean; holiday_name: string | null };

function StaffRoleDashboard({ panel: key, permission, job, cta, actions }: Config) {
  const dash = useApi<StaffDashboardData>("/api/v1/staff/dashboard");
  const inbox = useApi<InboxItem[]>("/api/v1/staff/inbox", { limit: 3 });
  const me = useApi<StaffToday>("/api/v1/staff/attendance/today");
  const d = dash.data;
  const panel = d?.panels.find((p) => p.key === key);
  const trend = panel?.trend;
  const peak = trend ? Math.max(0, ...trend.months.map((m) => m.value)) : 0;

  const stats: Stat[] = panel
    ? panel.stats.slice(0, 4).map((s) => ({ label: s.label, value: typeof s.value === "number" ? s.value.toLocaleString("en-IN") : String(s.value), note: panel.title }))
    : [{ label: job, value: d ? "—" : "…", note: d ? `Needs the ${permission} permission` : "Loading" }];

  const hero = !d
    ? `Here is what needs doing in ${job.toLowerCase()} today.`
    : !panel
      ? `This account does not look after ${job.toLowerCase()} yet. The school office grants it with the ${permission} permission.`
      : panel.todo
        ? `Today: ${panel.todo}.`
        : `Nothing in ${job.toLowerCase()} needs your attention today.`;

  return (
    <>
      <Hero text={hero} cta={cta} />
      <ErrorNote>{dash.error}</ErrorNote>
      <StatStrip items={stats} />
      <QuickActions items={actions} />
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <Panel
            title={`${job} overview`}
            sub={trend ? `Last six months · ${trend.label.toLowerCase()}${peak ? ` · % of the busiest month (${peak.toLocaleString("en-IN")})` : ""}` : "Last six months"}
            action={
              trend ? (
                <div className="chart-key">
                  <span>{trend.label}</span>
                </div>
              ) : undefined
            }
          >
            {trend && peak > 0 ? (
              <Chart kind="line" labels={trend.months.map((m) => monthLabel(m.month))} values={trend.months.map((m) => Math.round((m.value / peak) * 100))} />
            ) : (
              <Empty>{!d ? "Loading…" : !panel ? `Needs the ${permission} permission.` : `No ${(trend?.label ?? "activity").toLowerCase()} in the last six months.`}</Empty>
            )}
          </Panel>
        </div>
        <aside>
          <TodaySchedulePanel
            href={cta.href}
            limit={3}
            todo={(d?.jobs ?? []).map((j) => ({ title: j[0].toUpperCase() + j.slice(1), sub: "To do today" }))}
          />
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <Panel title="Recent activity" sub="Your inbox">
            {inbox.data?.length ? (
              inbox.data.map((n) => <TimelineRow key={n.recipient_id} icon="message" title={n.title} sub={n.body.split("\n")[0]} time={dateTime(n.sent_at)} />)
            ) : (
              <Empty>{inbox.loading ? "Loading…" : inbox.error ? inbox.error : "Nothing in your inbox."}</Empty>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Your attendance today">
            {me.data ? (
              <dl className="kv">
                <div>
                  <dt>Status</dt>
                  <dd>{me.data.is_holiday ? (me.data.holiday_name ?? "Holiday") : me.data.has_record ? label(me.data.status) : "Not checked in"}</dd>
                </div>
                <div>
                  <dt>Checked in</dt>
                  <dd>{dateTime(me.data.check_in_at)}</dd>
                </div>
                <div>
                  <dt>Checked out</dt>
                  <dd>{dateTime(me.data.check_out_at)}</dd>
                </div>
              </dl>
            ) : (
              <Empty>{me.loading ? "Loading…" : (me.error ?? "—")}</Empty>
            )}
            <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
              <Link href={routeOf(1090)} className="btn">
                {me.data && !me.data.is_holiday && !me.data.check_in_at ? "Check in" : "My attendance"}
              </Link>
              <Link href={routeOf(1091)} className="btn">
                My leave
              </Link>
              <Link href={routeOf(1092)} className="btn">
                My payslips
              </Link>
            </div>
            <div style={{ marginTop: 8 }}>
              <Link href={routeOf(179)} className="btn text">
                Staff attendance
              </Link>
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}

/** SCR-039, live: the hr panel of GET /api/v1/staff/dashboard, plus /staff/inbox and /staff/attendance/today. */
export function HrDashboard() {
  return (
    <StaffRoleDashboard
      panel="hr"
      permission="hr.manage"
      job="Staff and leave"
      cta={{ href: "/human-resources/staff-leave-requests", label: "Review leave" }}
      actions={[
        [routeOf(80), "users", "Staff directory"],
        [routeOf(181), "file", "Leave requests"],
        [routeOf(179), "calendar", "Staff attendance"],
        [routeOf(184), "money", "Payroll"],
      ]}
    />
  );
}

/** SCR-040, live: the admissions panel of GET /api/v1/staff/dashboard, plus /staff/inbox and /staff/attendance/today. */
export function AdmissionOfficerDashboard() {
  return (
    <StaffRoleDashboard
      panel="admissions"
      permission="admissions.manage"
      job="Admissions"
      cta={{ href: routeOf(48), label: "Review applications" }}
      actions={[
        [routeOf(44), "users", "Enquiries"],
        [routeOf(48), "file", "Applications"],
        [routeOf(51), "check", "Documents"],
        [routeOf(53), "file", "Approvals"],
      ]}
    />
  );
}

/** SCR-041, live: the transport panel of GET /api/v1/staff/dashboard, plus /staff/inbox and /staff/attendance/today. */
export function TransportManagerDashboard() {
  return (
    <StaffRoleDashboard
      panel="transport"
      permission="transport.manage"
      job="Transport"
      cta={{ href: "/transport/live-gps-tracking", label: "Track buses" }}
      actions={[
        [routeOf(189), "pin", "Routes"],
        [routeOf(186), "bus", "Vehicles"],
        [routeOf(193), "users", "Route assignment"],
        [routeOf(279), "chart", "Utilization"],
      ]}
    />
  );
}

/** SCR-042, live: the library panel of GET /api/v1/staff/dashboard, plus /staff/inbox and /staff/attendance/today. */
export function LibrarianDashboard() {
  return (
    <StaffRoleDashboard
      panel="library"
      permission="library.manage"
      job="Library"
      cta={{ href: "/library/issue-book", label: "Issue book" }}
      actions={[
        [routeOf(198), "book", "Catalogue"],
        [routeOf(202), "book", "Issue book"],
        [routeOf(203), "check", "Return book"],
        [routeOf(207), "chart", "Reports"],
      ]}
    />
  );
}
