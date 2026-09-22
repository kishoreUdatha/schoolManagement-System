"use client";

import Link from "next/link";
import { Chart } from "@/components/ui/Chart";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date, dateTime, money, pct } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { TodaySchedulePanel } from "../dashboards/parts";
import type { ActivityItem } from "../dashboards/types";
import { monthLabel, num } from "./kit";

type Overview = {
  academic_average: number | null;
  academic_average_exams: number;
  students: number;
  staff: number;
  attendance_this_month: number;
  collected_this_month: string;
  outstanding: string;
  attendance_by_month: { month: string; percent: number; present: number; absent: number; late: number; half_day: number }[];
  money_by_month: { month: string; collected: string; raised: string }[];
};
type Holiday = { id: number; name: string; type: string; start_date: string; end_date: string; days: number; description: string | null };

/** An icon for an activity line, by what was touched. */
function activityIcon(entity: string): IconName {
  if (/Fee|Payment|Refund|Cheque|Expense|Payroll|Salary|Concession|Income/.test(entity)) return "money";
  if (/Attendance|Absence/.test(entity)) return "check";
  if (/Notice|Message|Announcement/.test(entity)) return "message";
  if (/Student|Guardian|Admission|Enquiry|Application/.test(entity)) return "users";
  if (/Exam|Mark|Result|Homework|Syllabus|Lesson/.test(entity)) return "book";
  return "file";
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * SCR-264, live: GET /api/v1/school/analytics/overview (?months=6), GET /api/v1/school/holidays (?upcoming),
 * GET /api/v1/school/insights/schedule/today and GET /api/v1/school/insights/activity.
 */
export function ExecutiveDashboard() {
  const sess = useSession();
  const res = useApi<Overview>("/api/v1/school/analytics/overview", { months: 6 });
  const holidays = useApi<Holiday[]>("/api/v1/school/holidays", { upcoming: true, limit: 3 });
  const activity = useApi<ActivityItem[]>("/api/v1/school/insights/activity", { limit: 3 });
  const d = res.data;
  const first = sess?.user.full_name.split(/\s+/)[0];
  const now = new Date();
  const eyebrow = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase();
  const thisMonth = d?.money_by_month.at(-1);
  const att = d?.attendance_by_month ?? [];

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow">{eyebrow}</div>
          <h2>{first ? `${greeting()}, ${first}.` : `${greeting()}.`}</h2>
          <p>Here’s how your school is doing this month.</p>
          <Link href={routeOf(266)} className="btn white">
            <Icon name="arrow" className="sm" />
            View school overview
          </Link>
        </div>
        <HeroArt />
      </section>
      <ErrorNote>{res.error}</ErrorNote>
      <StatStrip
        items={[
          { label: "Students", value: num(d?.students), note: `${num(d?.staff)} staff` },
          { label: "Attendance", value: d ? pct(d.attendance_this_month) : "—", note: "This month · all classes" },
          {
            label: "Academic average",
            value: !d ? "—" : d.academic_average === null ? "—" : pct(d.academic_average),
            note: !d ? "Published exams" : d.academic_average === null ? "No published marks this year" : `${d.academic_average_exams} published exam(s) this year`,
          },
          { label: "Collected this month", value: money(d?.collected_this_month), note: thisMonth ? `${money(thisMonth.raised)} raised · ${money(d?.outstanding)} outstanding` : "Fees received" },
        ]}
      />
      <div className="dashboard-actions">
        <span className="small strong muted">Quick actions</span>
        <div className="quick-row">
          <Link className="quick-action" href={routeOf(56)}>
            <Icon name="cap" />
            Add student
          </Link>
          <Link className="quick-action" href="/attendance/daily-class-attendance">
            <Icon name="check" />
            Mark attendance
          </Link>
          <Link className="quick-action" href="/fees-finance/fee-collection">
            <Icon name="money" />
            Collect fee
          </Link>
          <Link className="quick-action" href="/communication/announcements">
            <Icon name="message" />
            Create notice
          </Link>
        </div>
      </div>
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <Panel
            title="Attendance overview"
            sub={`Last ${att.length || 6} months · All classes${res.loading ? " · Loading…" : ""}`}
            action={
              <div className="chart-key">
                <span>Attendance %</span>
              </div>
            }
          >
            {att.length ? <Chart kind="line" labels={att.map((m) => monthLabel(m.month).slice(0, 3))} values={att.map((m) => m.percent)} /> : <p className="muted">{res.loading ? "Loading…" : "No attendance yet."}</p>}
          </Panel>
        </div>
        <aside>
          <TodaySchedulePanel />
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <Panel title="Recent activity" action={sess?.user.role === "school_admin" ? <Link href={routeOf(294)} className="btn text">Audit log</Link> : undefined}>
            {activity.data?.length ? (
              activity.data.map((a) => (
                <div className="timeline-item" key={a.id}>
                  <span className="timeline-dot">
                    <Icon name={activityIcon(a.entity_type)} />
                  </span>
                  <div>
                    <h4>{a.title}</h4>
                    <p>{[a.detail, a.user_name ?? "System"].filter(Boolean).join(" · ")}</p>
                  </div>
                  <time>{dateTime(a.created_at)}</time>
                </div>
              ))
            ) : (
              <p className="muted">{activity.loading ? "Loading…" : (activity.error ?? "Nothing has happened yet.")}</p>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Coming up" sub="School holidays">
            {holidays.data?.length ? (
              holidays.data.map((h) => {
                const [, m, day] = h.start_date.split("-");
                return (
                  <div className="event-row" key={h.id}>
                    <div className="calendar-tile">
                      {Number(day)}
                      <small>{["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]}</small>
                    </div>
                    <div className="event-content">
                      <h4>{h.name}</h4>
                      <p>{h.days > 1 ? `${date(h.start_date)} – ${date(h.end_date)} · ${h.days} days` : date(h.start_date)}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="muted">{holidays.loading ? "Loading…" : holidays.error ?? "No holidays coming up."}</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
