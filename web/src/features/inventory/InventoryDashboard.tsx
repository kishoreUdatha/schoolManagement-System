"use client";

import Link from "next/link";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { date, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { BarList, INV, MOVE_LABEL, daysUntil, qty, today, type Asset, type Assignment, type Dashboard, type LabBooking, type Move, type Valuation } from "./common";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * SCR-234, live: GET /inventory/dashboard for the headline figures and low
 * stock, /analytics/inventory for value by category, /inventory/moves for
 * recent activity, /inventory/assignments, /inventory/assets for warranties
 * and /lab-bookings for what is coming up.
 */
export function InventoryDashboard() {
  const me = useSession()?.user;
  const now = new Date();
  const soon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const soonIso = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;

  const dash = useApi<Dashboard>(`${INV}/dashboard`);
  const val = useApi<Valuation>("/api/v1/school/analytics/inventory");
  const moves = useApi<Move[]>(`${INV}/moves`, { days: 30 });
  const out = useApi<Assignment[]>(`${INV}/assignments`, { open_only: true });
  const assets = useApi<Asset[]>(`${INV}/assets`);
  const bookings = useApi<LabBooking[]>("/api/v1/school/lab-bookings", { from: today(), to: soonIso });

  const d = dash.data;
  const n = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString("en-IN"));
  const stats = [
    { label: "Tracked items", value: n(d?.items), note: d ? `${money(Math.round(Number(d.stock_value)))} in stock` : "Store items" },
    { label: "Assets assigned", value: n(out.data?.length), note: d ? `Of ${d.assets} asset(s) on the register` : "Out with staff or rooms" },
    { label: "Low stock items", value: n(d?.low_stock.length), note: "At or below reorder level" },
    // Not wired: "Maintenance due" — assets carry no service schedule; what is away being repaired is shown instead.
    { label: "Under repair", value: n(d?.assets_in_repair), note: d?.warranty_expiring ? `${d.warranty_expiring} warranty(ies) ending within 30 days` : "No warranties ending soon" },
  ];

  const recent = (moves.data ?? []).slice(0, 4);
  const warranties = (assets.data ?? [])
    .filter((a) => {
      const x = daysUntil(a.warranty_until);
      return x !== null && x >= 0 && x <= 30;
    })
    .slice(0, 3);
  const upcoming = (bookings.data ?? []).slice(0, 3);
  const error = dash.error ?? val.error ?? moves.error;

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow" suppressHydrationWarning>{`${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`}</div>
          <h2 suppressHydrationWarning>{`${greeting()}${me ? `, ${me.full_name.split(/\s+/)[0]}` : ""}.`}</h2>
          <p>Here’s what is happening across the store, assets and labs today.</p>
          <Link href="/inventory-labs/stock-asset-reports" className="btn white">
            <Icon name="arrow" className="sm" />
            View stock & asset reports
          </Link>
        </div>
        <HeroArt />
      </section>
      <ErrorNote>{error}</ErrorNote>
      <StatStrip items={stats} />
      <div className="dashboard-actions">
        <span className="small strong muted">Quick actions</span>
        <div className="quick-row">
          <Link className="quick-action" href="/inventory-labs/stock-in-purchase-receipt">
            <Icon name="download" />
            Receive stock
          </Link>
          <Link className="quick-action" href="/inventory-labs/stock-issue-return">
            <Icon name="arrow" />
            Issue stock
          </Link>
          <Link className="quick-action" href="/inventory-labs/asset-register?new=1">
            <Icon name="plus" />
            Register asset
          </Link>
          <Link className="quick-action" href="/inventory-labs/practical-lab-booking?new=1">
            <Icon name="calendar" />
            Book a lab
          </Link>
        </div>
      </div>
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <Panel title="Stock value by category" sub={val.data ? `${money(Math.round(Number(val.data.stock_value)))} across ${val.data.items} item(s)` : "Whole store"}>
            {val.data?.by_category.length ? (
              <BarList rows={val.data.by_category.map((c) => ({ label: c.label, value: Number(c.value) }))} format={(x) => (x >= 1000 ? `₹${Math.round(x / 1000)}k` : `₹${Math.round(x)}`)} />
            ) : (
              <p className="muted">{val.loading ? "Loading…" : "No stock has been received yet."}</p>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Low stock" action={<Link href="/inventory-labs/item-catalogue" className="btn text">View all</Link>}>
            {d?.low_stock.length ? (
              d.low_stock.slice(0, 4).map((i) => (
                <div className="event-row" key={i.id}>
                  <div className="event-content">
                    <h4>{i.name}</h4>
                    <p>{`${qty(i.on_hand)} ${i.unit} on hand · reorder at ${qty(i.reorder_level)}`}</p>
                  </div>
                  <span className={`badge ${Number(i.on_hand) <= 0 ? "bad" : "warn"}`}>{Number(i.on_hand) <= 0 ? "Out of stock" : "Low"}</span>
                </div>
              ))
            ) : (
              <p className="muted">{dash.loading ? "Loading…" : "Nothing is below its reorder level."}</p>
            )}
          </Panel>
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <Panel title="Recent activity" sub="Stock movements in the last 30 days">
            {recent.length ? (
              recent.map((m) => (
                <div className="timeline-item" key={m.id}>
                  <span className="timeline-dot">
                    <Icon name={m.direction > 0 ? "download" : "arrow"} />
                  </span>
                  <div>
                    <h4>{`${MOVE_LABEL[m.kind]} · ${m.item_name}`}</h4>
                    <p>{[`${m.direction > 0 ? "+" : "−"}${qty(m.qty)}`, m.supplier_name || m.issued_to, m.recorded_by_name].filter(Boolean).join(" · ")}</p>
                  </div>
                  <time>{date(m.moved_on)}</time>
                </div>
              ))
            ) : (
              <p className="muted">{moves.loading ? "Loading…" : "Nothing moved in the last 30 days."}</p>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Coming up">
            {upcoming.map((b) => {
              const [, m, dd] = b.booking_date.split("-");
              return (
                <div className="event-row" key={`b${b.id}`}>
                  <div className="calendar-tile">
                    {Number(dd)}
                    <small>{SHORT[Number(m) - 1]}</small>
                  </div>
                  <div className="event-content">
                    <h4>{`${b.lab_name}${b.section_label ? ` · ${b.section_label}` : ""}`}</h4>
                    <p>{`Period ${b.period_number}${b.purpose ? ` · ${b.purpose}` : ""}`}</p>
                  </div>
                  <Link href="/inventory-labs/practical-lab-booking" className="btn text">
                    View
                  </Link>
                </div>
              );
            })}
            {warranties.map((a) => {
              const [, m, dd] = (a.warranty_until ?? "").split("-");
              return (
                <div className="event-row" key={`a${a.id}`}>
                  <div className="calendar-tile">
                    {Number(dd)}
                    <small>{SHORT[Number(m) - 1]}</small>
                  </div>
                  <div className="event-content">
                    <h4>{`Warranty ends · ${a.name}`}</h4>
                    <p>{[a.asset_tag, a.supplier_name].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Link href="/inventory-labs/asset-maintenance" className="btn text">
                    View
                  </Link>
                </div>
              );
            })}
            {!upcoming.length && !warranties.length ? <p className="muted">{bookings.loading || assets.loading ? "Loading…" : "No lab bookings this week and no warranties ending within 30 days."}</p> : null}
          </Panel>
        </aside>
      </div>
    </>
  );
}
