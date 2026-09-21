"use client";

import { Chart } from "@/components/ui/Chart";
import { StatStrip, type Stat } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { dateTime, date, label, money, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { count, DateRow, Empty, Hero, lastMonths, monthLabel, QuickActions, TimelineRow } from "./parts";
import type { AnalyticsOverview, Approval, OfficeDashboard } from "./types";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const thisMonth = () => {
  const d = new Date();
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
};

/** Six months of school-wide attendance, from the analytics overview. */
function AttendanceTrend({ overview, loading }: { overview: AnalyticsOverview | null; loading: boolean }) {
  const byMonth = new Map((overview?.attendance_by_month ?? []).map((m) => [m.month, m]));
  const months = lastMonths(6);
  const marked = months.some((m) => {
    const x = byMonth.get(m);
    return x && x.present + x.absent + x.late + x.half_day > 0;
  });
  return (
    <Panel
      title="Attendance overview"
      sub="Last six months · All classes"
      action={
        <div className="chart-key">
          <span>Present %</span>
        </div>
      }
    >
      {overview && marked ? (
        <Chart kind="line" labels={months.map(monthLabel)} values={months.map((m) => byMonth.get(m)?.percent ?? 0)} />
      ) : (
        <Empty>{loading ? "Loading attendance…" : "No attendance has been marked in the last six months."}</Empty>
      )}
    </Panel>
  );
}

/** "Coming up": exams and holidays in the next seven days, soonest first. */
function ComingUp({ d }: { d: OfficeDashboard | null }) {
  const items = [
    ...(d?.upcoming_exams ?? []).map((e) => ({
      day: e.start_date,
      title: e.name,
      sub: `${label(e.kind)} · ${e.papers_count} paper(s) · ${e.is_published ? "Published" : "Draft"}`,
      href: "/examinations/exam-schedule",
    })),
    ...(d?.upcoming_holidays ?? []).map((h) => ({
      day: h.start_date,
      title: h.name,
      sub: `${label(h.type)} holiday · ${h.start_date === h.end_date ? date(h.start_date) : `${date(h.start_date)} – ${date(h.end_date)}`}`,
      href: undefined,
    })),
  ].sort((a, b) => a.day.localeCompare(b.day));
  return (
    <Panel title="Coming up">
      {items.length ? items.slice(0, 4).map((x, i) => <DateRow key={i} {...x} />) : <Empty>{d ? "No exams or holidays in the next seven days." : "Loading…"}</Empty>}
    </Panel>
  );
}

/** The latest notices sent, as "Recent activity". */
function RecentNotices({ d }: { d: OfficeDashboard | null }) {
  return (
    <Panel title="Recent activity">
      {d?.latest_notices.length ? (
        d.latest_notices.map((n) => (
          <TimelineRow key={n.id} icon="message" title={n.title} sub={`Notice to ${label(n.audience).toLowerCase()} · ${n.recipient_count} recipient(s)`} time={dateTime(n.sent_at)} />
        ))
      ) : (
        <Empty>{d ? "No notices have been sent yet." : "Loading…"}</Empty>
      )}
    </Panel>
  );
}

function attendanceStat(d: OfficeDashboard | null): Stat {
  const a = d?.attendance;
  if (!d) return { label: "Attendance today", value: "…", note: "Loading" };
  if (!a?.available || !a.marked) return { label: "Attendance today", value: "—", note: a?.note ?? "No register marked yet today" };
  return { label: "Attendance today", value: pct(a.attendance_pct), note: `${a.marked} of ${d.counts.students_active} students marked` };
}

/** SCR-033, live: GET /api/v1/school/dashboard and /api/v1/school/analytics/overview. */
export function SchoolAdminDashboard() {
  const dash = useApi<OfficeDashboard>("/api/v1/school/dashboard");
  const overview = useApi<AnalyticsOverview>("/api/v1/school/analytics/overview", { months: 6 });
  const d = dash.data;
  const o = overview.data;

  const stats: Stat[] = [
    { label: "Students", value: count(d?.counts.students_active), note: d?.current_academic_year_name ? `${d.current_academic_year_name} academic year` : "Current academic year" },
    { label: "Teachers", value: count(d?.counts.teachers_active), note: d ? `+ ${d.counts.non_teaching_active} non-teaching staff` : "Active teachers" },
    attendanceStat(d),
    { label: "Fees collected", value: o ? money(o.collected_this_month) : "…", note: thisMonth() },
  ];

  const hero = !d
    ? "Here’s what is happening across your school today."
    : d.fees.overdue_count > 0
      ? `${d.fees.overdue_count} fee record(s) are overdue — ${money(d.fees.overdue_outstanding)} in all. ${d.admissions.this_month_count} admission(s) this month.`
      : `Nothing is overdue. ${d.admissions.this_month_count} admission(s) this month.`;

  return (
    <>
      <Hero text={hero} cta={{ href: "/reports-analytics/executive-analytics-dashboard", label: "View school overview" }} />
      <ErrorNote>{dash.error ?? overview.error}</ErrorNote>
      <StatStrip items={stats} />
      <QuickActions
        items={[
          ["/students/add-student", "cap", "Add student"],
          ["/attendance/daily-class-attendance", "check", "Mark attendance"],
          ["/fees-finance/fee-collection", "money", "Collect fee"],
          ["/communication/announcements", "message", "Create notice"],
        ]}
      />
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <AttendanceTrend overview={o} loading={overview.loading} />
        </div>
        <aside>
          {/* Not wired: the mock's "Today's schedule" (a school-wide timetable for the day) — no endpoint; this month's figures stand in its place. */}
          <Panel title="This month">
            <dl className="kv">
              <div>
                <dt>New admissions</dt>
                <dd>{count(d?.admissions.this_month_count)}</dd>
              </div>
              <div>
                <dt>Fees outstanding (all time)</dt>
                <dd>{d ? money(d.fees.pending_outstanding) : "…"}</dd>
              </div>
              <div>
                <dt>Homework handed in</dt>
                <dd>{d?.homework.available ? pct(d.homework.submission_rate_pct) : "—"}</dd>
              </div>
              <div>
                <dt>Notices sent</dt>
                <dd>{count(d?.notifications?.sent_count)}</dd>
              </div>
            </dl>
          </Panel>
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <RecentNotices d={d} />
        </div>
        <aside>
          <ComingUp d={d} />
        </aside>
      </div>
    </>
  );
}

const APPROVAL_LABEL: Record<Approval["kind"], string> = {
  marks_correction: "Marks correction",
  attendance_edit: "Attendance edit",
  staff_leave: "Staff leave",
  result_publishing: "Result publishing",
};

/** SCR-034, live: GET /api/v1/principal/dashboard, /api/v1/principal/approvals and the analytics overview. */
export function PrincipalDashboard() {
  const dash = useApi<OfficeDashboard>("/api/v1/principal/dashboard");
  const approvals = useApi<Approval[]>("/api/v1/principal/approvals", { status: "pending", limit: 500 });
  const overview = useApi<AnalyticsOverview>("/api/v1/school/analytics/overview", { months: 6 });
  const d = dash.data;
  const open = approvals.data;
  const exam = d?.exam_performance;

  const stats: Stat[] = [
    attendanceStat(d),
    {
      label: "Academic average",
      value: !d ? "…" : exam?.available && exam.marks_count ? pct(exam.average_pct) : "—",
      note: exam?.exam_name ? `${exam.exam_name}${exam.marks_count ? ` · pass rate ${pct(exam.pass_rate_pct)}` : " · no marks yet"}` : "Latest exam",
    },
    { label: "Open approvals", value: open ? (open.length >= 500 ? "500+" : String(open.length)) : "…", note: "Waiting for your decision" },
    // Not wired: the mock's "Classes observed" — no endpoint; homework hand-in rate shown instead.
    {
      label: "Homework handed in",
      value: !d ? "…" : d.homework.available ? pct(d.homework.submission_rate_pct) : "—",
      note: d?.homework.available ? `${d.homework.total_homework ?? 0} homework set this month` : (d?.homework.note ?? "This month"),
    },
  ];

  const hero = !open
    ? "Here’s what is happening across your school today."
    : open.length
      ? `${open.length} request(s) are waiting for your approval.`
      : "Nothing is waiting for your approval.";

  return (
    <>
      <Hero text={hero} cta={{ href: "/reports-analytics/executive-analytics-dashboard", label: "View school overview" }} />
      <ErrorNote>{dash.error ?? approvals.error ?? overview.error}</ErrorNote>
      <StatStrip items={stats} />
      <QuickActions
        items={[
          ["/students/add-student", "cap", "Add student"],
          ["/attendance/daily-class-attendance", "check", "Mark attendance"],
          ["/fees-finance/fee-collection", "money", "Collect fee"],
          ["/communication/announcements", "message", "Create notice"],
        ]}
      />
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <AttendanceTrend overview={overview.data} loading={overview.loading} />
        </div>
        <aside>
          {/* Not wired: the mock's "Today's schedule" — no endpoint; the approvals queue stands in its place. */}
          <Panel title="Waiting for approval" sub="Marks, attendance, leave and results">
            {open?.length ? (
              open.slice(0, 3).map((a) => (
                <TimelineRow key={a.id} icon="file" title={APPROVAL_LABEL[a.kind]} sub={`${a.requested_by_name ?? "—"}${a.reason ? ` · ${a.reason}` : ""}`} time={dateTime(a.created_at)} />
              ))
            ) : (
              <Empty>{open ? "Nothing is waiting for approval." : "Loading…"}</Empty>
            )}
          </Panel>
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <RecentNotices d={d} />
        </div>
        <aside>
          <ComingUp d={d} />
        </aside>
      </div>
    </>
  );
}
