"use client";

import Link from "next/link";
import { Chart } from "@/components/ui/Chart";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import type { Paginated } from "@/lib/api";
import { date, dateTime, label } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useHydrated, useSession } from "@/lib/useSession";
import { appClass, APPS, daysFromToday, ENQ, todayIso, useYears } from "./shared";
import type { AdmissionStats, Application, Enquiry, Funnel } from "./types";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * SCR-043, live: GET /admissions/stats (enquiry funnel), GET
 * /applications/funnel, GET /enquiries?open_only=true (follow-ups) and
 * GET /applications (latest applications and what is waiting on the office).
 */
export function AdmissionDashboard() {
  const me = useSession()?.user;
  const hydrated = useHydrated();
  const { current } = useYears();
  const stats = useApi<AdmissionStats>("/api/v1/school/admissions/stats");
  const funnel = useApi<Funnel>(`${APPS}/funnel`);
  const open = useApi<Paginated<Enquiry>>(ENQ, { open_only: true, page_size: 200 });
  const apps = useApi<Application[]>(APPS);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const n = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString("en-IN"));
  const s = stats.data;
  const f = funnel.data;
  const figures = [
    { label: "Enquiries", value: n(s?.total), note: s ? `${s.open} open · ${s.follow_ups_due} follow-ups due` : "All enquiries" },
    { label: "Applications", value: n(f?.total), note: f ? `${f.in_progress} in progress` : "All applications" },
    { label: "At assessment", value: n(f ? f.by_status.assessment ?? 0 : undefined), note: "Applications being assessed" },
    { label: "Admissions confirmed", value: n(f?.admitted), note: s ? `${s.enrolled} enquiries enrolled · ${s.conversion_rate.toFixed(1)}% conversion` : "Admitted as students" },
  ];

  // Where enquiries stand now, as a share of all enquiries, in the mock's bar chart.
  const by = s?.by_stage;
  const groups: [string, number][] = by
    ? [
        ["Enquiry", by.enquiry],
        ["Contacted", by.contacted],
        ["Visit", by.visit_scheduled + by.visited],
        ["Applied", by.applied + by.test_scheduled],
        ["Offered", by.offered],
        ["Enrolled", by.enrolled],
      ]
    : [];
  const share = (v: number) => (s && s.total ? Math.max(0, Math.round((v / s.total) * 100)) : 0);

  const today = todayIso();
  const withDate = (open.data?.items ?? []).filter((e) => e.next_follow_up_date).sort((a, z) => (a.next_follow_up_date ?? "").localeCompare(z.next_follow_up_date ?? ""));
  const dueNow = withDate.filter((e) => (e.next_follow_up_date ?? "") <= today);
  const comingUp = withDate.filter((e) => {
    const d = daysFromToday(e.next_follow_up_date);
    return d !== null && d > 0 && d <= 14;
  });
  const recent = [...(apps.data ?? [])].sort((a, z) => (z.submitted_at ?? "").localeCompare(a.submitted_at ?? "")).filter((a) => a.submitted_at).slice(0, 4);
  const error = stats.error ?? funnel.error ?? open.error ?? apps.error;

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow">{hydrated ? `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}` : "ADMISSIONS"}</div>
          <h2>{hydrated ? `${greeting}${me ? `, ${me.full_name.split(" ")[0]}` : ""}.` : "Welcome."}</h2>
          <p>{`Here’s where admissions stand${current ? ` for ${current.name}` : ""}.`}</p>
          <Link href={routeOf(44)} className="btn white">
            <Icon name="arrow" className="sm" />
            View all enquiries
          </Link>
        </div>
        <HeroArt />
      </section>
      <ErrorNote>{error}</ErrorNote>
      <StatStrip items={figures} />
      <div className="dashboard-actions">
        <span className="small strong muted">Quick actions</span>
        <div className="quick-row">
          <Link className="quick-action" href={routeOf(45)}>
            <Icon name="plus" />
            Add enquiry
          </Link>
          <Link className="quick-action" href={routeOf(49)}>
            <Icon name="file" />
            New application
          </Link>
          <Link className="quick-action" href={routeOf(51)}>
            <Icon name="check" />
            Verify documents
          </Link>
          <Link className="quick-action" href={routeOf(53)}>
            <Icon name="cap" />
            Approve admissions
          </Link>
        </div>
      </div>
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <Panel
            title="Enquiry funnel"
            sub={s ? `${s.total} enquiries · share at each stage now${s.lost ? ` · ${s.lost} lost` : ""}` : "Loading…"}
            action={
              <div className="chart-key">
                <span>Share of enquiries</span>
              </div>
            }
          >
            {s?.total ? (
              <Chart labels={groups.map(([l]) => l)} values={groups.map(([, v]) => share(v))} />
            ) : (
              <p className="muted">{s ? "No enquiries yet." : "Loading…"}</p>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Today’s follow-ups" action={<Link href={routeOf(47)} className="btn text">View all</Link>}>
            {dueNow.length ? (
              dueNow.slice(0, 4).map((e) => {
                const d = daysFromToday(e.next_follow_up_date) ?? 0;
                return (
                  <div className="event-row" key={e.id}>
                    <div className="event-time">
                      {e.next_follow_up_date?.slice(8, 10)}
                      <small style={{ display: "block", fontSize: "9px" }}>{SHORT[Number(e.next_follow_up_date?.slice(5, 7)) - 1]}</small>
                    </div>
                    <div className="event-content">
                      <h4>
                        <Link href={`${routeOf(46)}?id=${e.id}`}>{e.student_name}</Link>
                      </h4>
                      <p>{`${e.applying_for_class ?? "—"} · ${label(e.stage)}`}</p>
                    </div>
                    <Badge>{d < 0 ? "Overdue" : "Due today"}</Badge>
                  </div>
                );
              })
            ) : (
              <p className="muted">{open.loading ? "Loading…" : "No follow-ups due today."}</p>
            )}
          </Panel>
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <Panel title="Recent applications" action={<Link href={routeOf(48)} className="btn text">View all</Link>}>
            {recent.length ? (
              recent.map((a) => (
                <div className="timeline-item" key={a.id}>
                  <span className="timeline-dot">
                    <Icon name="file" />
                  </span>
                  <div>
                    <h4>
                      <Link href={`${routeOf(50)}?id=${a.id}`}>{`${a.student_name} · ${label(a.status)}`}</Link>
                    </h4>
                    <p>{`${appClass(a)} · ${a.application_no}`}</p>
                  </div>
                  <time>{dateTime(a.submitted_at)}</time>
                </div>
              ))
            ) : (
              <p className="muted">{apps.loading ? "Loading…" : "No applications submitted yet."}</p>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Coming up">
            {comingUp.length ? (
              comingUp.slice(0, 4).map((e) => (
                <div className="event-row" key={e.id}>
                  <div className="calendar-tile">
                    {Number(e.next_follow_up_date?.slice(8, 10))}
                    <small>{SHORT[Number(e.next_follow_up_date?.slice(5, 7)) - 1]}</small>
                  </div>
                  <div className="event-content">
                    <h4>{e.student_name}</h4>
                    <p>{`Follow-up · ${e.assigned_to_name ?? "Unassigned"} · ${date(e.next_follow_up_date)}`}</p>
                  </div>
                  <Link href={`${routeOf(46)}?id=${e.id}`} className="btn text">
                    View
                  </Link>
                </div>
              ))
            ) : (
              <p className="muted">{open.loading ? "Loading…" : "No follow-ups in the next two weeks."}</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
