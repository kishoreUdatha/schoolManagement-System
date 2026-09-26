"use client";

import Link from "next/link";
import { HeroArt } from "@/components/ui/HeroArt";
import { Chart } from "@/components/ui/Chart";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { useState } from "react";
import { api, errorText, type Paginated } from "@/lib/api";
import { notify } from "@/lib/notify";
import { date, dateTime, money } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { Health, Renewal, SchoolsByMonth, Tenant, TicketList, UsageSummary } from "./types";

import { ask } from "@/lib/dialog";
import { useGreeting } from "@/features/dashboards/parts";
const n = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString("en-IN"));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * SCR-009, live: usage/summary, usage/renewals, health, tickets and the
 * newest tenants. Figures are platform-wide, as the super-admin sees them.
 * "Send reminders" posts /usage/renewals/send for the same 30-day window.
 */
export function PlatformDashboard() {
  const summary = useApi<UsageSummary>("/api/v1/super-admin/usage/summary");
  const renewals = useApi<Renewal[]>("/api/v1/super-admin/usage/renewals", { within_days: 30 });
  const health = useApi<Health>("/api/v1/super-admin/health");
  const tickets = useApi<TicketList>("/api/v1/super-admin/tickets");
  const recent = useApi<Paginated<Tenant>>("/api/v1/super-admin/tenants", { page_size: 3 });
  const activeByMonth = useApi<SchoolsByMonth>("/api/v1/super-admin/activity/schools-by-month", { months: 6 });
  const trend = activeByMonth.data ?? [];
  const peakSchools = Math.max(0, ...trend.map((m) => m.schools));

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function sendReminders() {
    const count = renewals.data?.length ?? 0;
    if (!(await ask(`Send a renewal reminder to the school admins of ${count} organization(s) whose subscription ends in the next 30 days? It goes out in-app and by email.`))) return;
    setSending(true);
    setSendError(null);
    try {
      const r = await api.post<{ tenants_notified?: number; notices_created?: number; tenants_due?: number }>("/api/v1/super-admin/usage/renewals/send", undefined, { within_days: 30 });
      const sent = r.tenants_notified ?? 0;
      const due = r.tenants_due ?? count;
      if (sent < due) setSendError(`Reminders reached ${sent} of ${due} organization(s). The others have no one to receive them.`);
      else notify(`Reminders sent to ${sent} organization(s).`);
    } catch (err) {
      setSendError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  const s = summary.data;
  const h = health.data;
  const t = tickets.data;
  // name and date only once hydrated: the server renders before it knows the viewer or their clock
  const g = useGreeting();

  const stats = [
    { label: "Organizations", value: n(s?.total_tenants), note: s ? `${s.active_tenants} active · ${s.suspended_tenants} suspended` : "All tenants" },
    { label: "Schools", value: n(s?.total_schools), note: "Across all organizations" },
    { label: "Active users", value: n(h?.users_active), note: "Accounts that can sign in" },
    { label: "Revenue (30 days)", value: s ? money(s.revenue_30d) : "…", note: "Subscription payments recorded" },
  ];

  const usage: [string, string][] = s
    ? [
        ["Students", n(s.total_students)],
        ["Staff", n(s.total_staff)],
        ["Parents", n(s.total_parents)],
        ["SMS sent", n(s.sms_sent_30d)],
        ["WhatsApp sent", n(s.whatsapp_sent_30d)],
        ["Emails sent", n(s.email_sent_30d)],
        ["Storage used", `${n(s.storage_used_mb)} MB`],
      ]
    : [];

  const upcoming = renewals.data ?? [];
  const attention: { title: string; sub: string; badge: string; tone: string; href: string }[] = [
    {
      title: "Subscription renewals",
      sub: renewals.data ? `${upcoming.length} expiring in the next 30 days` : "Loading…",
      badge: upcoming.length ? "Due" : "Clear",
      tone: upcoming.length ? "warn" : "",
      href: routeOf(14),
    },
    {
      title: "Support queue",
      sub: t ? `${t.open} open · ${t.waiting} waiting${t.urgent_open ? ` · ${t.urgent_open} urgent` : ""}` : "Loading…",
      badge: t && t.open + t.waiting > 0 ? "Pending" : "Clear",
      tone: t && t.urgent_open ? "bad" : t && t.open + t.waiting > 0 ? "warn" : "",
      href: routeOf(17),
    },
    {
      title: "Suspended organizations",
      sub: s ? `${s.suspended_tenants} of ${s.total_tenants}` : "Loading…",
      badge: s && s.suspended_tenants ? "Review" : "Clear",
      tone: s && s.suspended_tenants ? "warn" : "",
      href: `${routeOf(10)}?status=suspended`,
    },
  ];

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow">{g.eyebrow}</div>
          <h2>{g.title}</h2>
          <p>Review connected schools, organization usage, billing and platform support.</p>
          <Link href={routeOf(15)} className="btn white">
            <Icon name="arrow" className="sm" />
            View tenant usage
          </Link>
        </div>
        <HeroArt />
      </section>
      <ErrorNote>{summary.error ?? health.error}</ErrorNote>
      <StatStrip items={stats} />
      <div className="dashboard-actions">
        <span className="small strong muted">Quick actions</span>
        <div className="quick-row">
          <Link className="quick-action" href={routeOf(11)}>
            <Icon name="building" />
            Add organization
          </Link>
          <Link className="quick-action" href={routeOf(13)}>
            <Icon name="money" />
            Subscription plans
          </Link>
          <Link className="quick-action" href={routeOf(17)}>
            <Icon name="message" />
            Support tickets
          </Link>
          <Link className="quick-action" href={routeOf(19)}>
            <Icon name="bell" />
            Create announcement
          </Link>
        </div>
      </div>
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <Panel
            title="Platform activity"
            sub={peakSchools ? `Active schools over the last six months · % of the ${peakSchools} school(s) on the platform` : "Active schools over the last six months"}
            action={
              h ? (
                <Link href={routeOf(18)} className="live-indicator">
                  {h.all_monitored_up ? "All monitored services up" : "A monitored service is down"}
                </Link>
              ) : undefined
            }
          >
            {/* Active: anything recorded in the school's audit trail that month, a sign-in included. */}
            {peakSchools ? (
              <Chart
                kind="line"
                labels={trend.map((m) => MONTHS[Number(m.month.slice(5, 7)) - 1])}
                values={trend.map((m) => Math.round((m.active / peakSchools) * 100))}
                label="Active schools by month"
              />
            ) : (
              <p className="muted">{activeByMonth.loading ? "Loading…" : (activeByMonth.error ?? "No school activity recorded yet.")}</p>
            )}
            {trend.length ? <p className="muted small">{trend.map((m) => `${MONTHS[Number(m.month.slice(5, 7)) - 1]} ${m.active}/${m.schools}`).join(" · ")}</p> : null}
            <div style={{ height: 12 }} />
            <h4 className="small strong muted">Usage · totals across all organizations, messages over the last 30 days</h4>
            {usage.length ? (
              <dl className="kv">
                {usage.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">{summary.loading ? "Loading…" : "No usage figures."}</p>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Needs attention">
            {attention.map((a) => (
              <div className="event-row" key={a.title}>
                <div className="event-content">
                  <h4>
                    <Link href={a.href}>{a.title}</Link>
                  </h4>
                  <p>{a.sub}</p>
                </div>
                <span className={`badge ${a.tone}`}>{a.badge}</span>
              </div>
            ))}
          </Panel>
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <Panel title="Newest organizations" action={<Link href={routeOf(10)} className="btn text">View all</Link>}>
            {recent.data?.items.length ? (
              recent.data.items.map((o) => (
                <div className="timeline-item" key={o.id}>
                  <span className="timeline-dot">
                    <Icon name="building" />
                  </span>
                  <div>
                    <h4>
                      <Link href={`${routeOf(12)}?id=${o.id}`}>{o.name}</Link>
                    </h4>
                    <p>{`${o.code} · ${o.contact_person ?? o.contact_email} · ${o.status}`}</p>
                  </div>
                  <time>{dateTime(o.created_at)}</time>
                </div>
              ))
            ) : (
              <p className="muted">{recent.loading ? "Loading…" : "No organizations yet."}</p>
            )}
          </Panel>
        </div>
        <aside>
          <Panel
            title="Renewals coming up"
            sub="Next 30 days"
            action={
              upcoming.length ? (
                <button type="button" className="btn" disabled={sending} onClick={sendReminders}>
                  <Icon name="bell" className="sm" />
                  {sending ? "Sending…" : "Send reminders"}
                </button>
              ) : undefined
            }
          >
            <ErrorNote>{sendError}</ErrorNote>
            {upcoming.length ? (
              upcoming.slice(0, 4).map((r) => {
                const d = r.expires_at ? new Date(r.expires_at) : null;
                return (
                  <div className="event-row" key={r.tenant_id}>
                    <div className="calendar-tile">
                      {d ? d.getDate() : "—"}
                      <small>{d ? MONTHS[d.getMonth()] : ""}</small>
                    </div>
                    <div className="event-content">
                      <h4>{r.tenant_name}</h4>
                      <p>{`${r.days_remaining ?? "—"} days left · expires ${date(r.expires_at)}`}</p>
                    </div>
                    <Link href={`${routeOf(12)}?id=${r.tenant_id}`} className="btn text">
                      View
                    </Link>
                  </div>
                );
              })
            ) : (
              <p className="muted">{renewals.loading ? "Loading…" : "No subscription expires in the next 30 days."}</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
