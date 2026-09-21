"use client";

import Link from "next/link";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import type { Paginated } from "@/lib/api";
import { date, dateTime, money } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import type { Health, Renewal, Tenant, TicketList, UsageSummary } from "./types";

const n = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString("en-IN"));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * SCR-009, live: usage/summary, usage/renewals, health, tickets and the
 * newest tenants. Figures are platform-wide, as the super-admin sees them.
 */
export function PlatformDashboard() {
  const sess = useSession();
  const summary = useApi<UsageSummary>("/api/v1/super-admin/usage/summary");
  const renewals = useApi<Renewal[]>("/api/v1/super-admin/usage/renewals", { within_days: 30 });
  const health = useApi<Health>("/api/v1/super-admin/health");
  const tickets = useApi<TicketList>("/api/v1/super-admin/tickets");
  const recent = useApi<Paginated<Tenant>>("/api/v1/super-admin/tenants", { page_size: 3 });

  const s = summary.data;
  const h = health.data;
  const t = tickets.data;
  const today = new Date();
  const eyebrow = today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase();

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
          <div className="eyebrow">{eyebrow}</div>
          <h2>{`${greeting()}, ${sess?.user.full_name.split(" ")[0] ?? "there"}.`}</h2>
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
            title="Platform usage"
            sub="Totals across all organizations · messages over the last 30 days"
            action={
              h ? (
                <Link href={routeOf(18)} className="live-indicator">
                  {h.all_monitored_up ? "All monitored services up" : "A monitored service is down"}
                </Link>
              ) : undefined
            }
          >
            {/* Not wired: a six-month trend of active schools — no endpoint keeps history. */}
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
          <Panel title="Renewals coming up" sub="Next 30 days">
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
