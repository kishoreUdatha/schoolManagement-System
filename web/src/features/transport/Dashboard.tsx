"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Chart } from "@/components/ui/Chart";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { Empty, Hero, QuickActions, TimelineRow } from "@/features/dashboards/parts";
import { Field, formNum, formText, n, today, useNewFlag } from "./kit";
import type { FeeHead, Route, TransportDashboard as Dash, Trip } from "./types";

import { ask } from "@/lib/dialog";
const TRANSPORT = "/api/v1/school/transport";
const STATUS: Record<Trip["status"], string> = { scheduled: "Scheduled", in_progress: "In transit", completed: "Completed", cancelled: "Cancelled" };

/**
 * NEW-072, live: GET /transport/dashboard for the headline figures and what
 * needs attention, today's trips from GET /transport/trips?on=, seat use per
 * route from GET /transport/routes. Monthly fees: POST /transport/fees/generate.
 */
export function TransportDashboard() {
  const isAdmin = useSession()?.user.role === "school_admin";
  const dash = useApi<Dash>(`${TRANSPORT}/dashboard`);
  const trips = useApi<Trip[]>(`${TRANSPORT}/trips`, { on: today() });
  const routes = useApi<Route[]>(`${TRANSPORT}/routes`);
  const d = dash.data;

  const seatsUsed = d && d.seats_total ? Math.round((d.students_using_transport / d.seats_total) * 100) : null;
  const stats = [
    { label: "Students on transport", value: n(d?.students_using_transport), note: seatsUsed === null ? "Seats not recorded" : `${seatsUsed}% of ${d?.seats_total} seats`, icon: "cap" as const },
    { label: "Active routes", value: n(d?.active_routes), note: "Routes marked active", icon: "pin" as const },
    { label: "Vehicles", value: n(d?.vehicles), note: d ? `${d.seats_total} seats in service` : "Active vehicles", icon: "bus" as const },
    { label: "Trips today", value: n(d?.trips_today), note: d ? `${d.trips_in_progress} in transit now` : "Trip sheets for today", icon: "calendar" as const },
  ];

  // Seat use per route, for routes that have a vehicle (and so a seat count).
  const withSeats = (routes.data ?? []).filter((r) => r.is_active && r.vehicle_capacity);
  const shown = withSeats.slice(0, 6);
  const attention = (d?.overloaded_routes.length ?? 0) + (d?.expiring_documents.length ?? 0);
  const hero = !d
    ? "Here is how transport stands today."
    : attention
      ? `${attention} thing(s) need attention: ${[d.overloaded_routes.length ? `${d.overloaded_routes.length} overloaded route(s)` : "", d.expiring_documents.length ? `${d.expiring_documents.length} document(s) to renew` : ""].filter(Boolean).join(" and ")}.`
      : `${d.trips_today} trip sheet(s) today and nothing overdue for renewal.`;

  return (
    <>
      <Hero text={hero} cta={{ href: routeOf(194), label: "Open trip sheets" }} />
      <ErrorNote>{dash.error}</ErrorNote>
      <StatStrip items={stats} />
      <QuickActions
        items={[
          [routeOf(186), "bus", "Vehicles"],
          [routeOf(189), "pin", "Routes"],
          [routeOf(193), "cap", "Student assignment"],
          [routeOf(194), "file", "Trip sheets"],
          [routeOf(195), "pin", "Live GPS"],
          [routeOf(197), "settings", "Maintenance & fuel"],
        ]}
      />
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <Panel title="Seat use by route" sub={withSeats.length > 6 ? `First 6 of ${withSeats.length} routes · students as % of the vehicle's seats` : "Students as % of the vehicle's seats"}>
            {shown.length ? (
              <>
                <Chart kind="bar" labels={shown.map((r) => r.code)} values={shown.map((r) => Math.min(100, Math.round((r.student_count / (r.vehicle_capacity ?? 1)) * 100)))} label="Seat use by route" />
                <p className="muted small">{shown.map((r) => `${r.code}: ${r.student_count}/${r.vehicle_capacity}`).join(" · ")}</p>
              </>
            ) : (
              <Empty>{routes.loading ? "Loading…" : (routes.error ?? "No active route has a vehicle assigned yet.")}</Empty>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Needs attention">
            {d?.overloaded_routes.map((o) => <TimelineRow key={`r${o.route_id}`} icon="users" title={`${o.route} is overloaded`} sub={`${o.students} students for ${o.capacity} seats`} />)}
            {d?.expiring_documents.map((x, i) => <TimelineRow key={`d${i}`} icon="bell" title={x.vehicle} sub={x.message} />)}
            {d && !attention ? <Empty>No overloaded routes and no documents due in the next 30 days.</Empty> : null}
            {!d ? <Empty>{dash.loading ? "Loading…" : "—"}</Empty> : null}
          </Panel>
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <Panel title="Today's trips" sub={trips.data ? `${trips.data.length} trip sheet(s)` : "Loading…"}>
            {trips.data?.length ? (
              trips.data.map((t) => (
                <div className="event-row" key={t.id}>
                  <div className="event-content">
                    <h4>{`${t.route_name} · ${t.direction === "pickup" ? "Morning pickup" : "Afternoon drop"}`}</h4>
                    <p>{`${t.vehicle_label ?? "No vehicle"} · ${t.driver_name ?? "No driver"} · ${t.boarded}/${t.expected} boarded`}</p>
                  </div>
                  <Badge>{STATUS[t.status]}</Badge>
                  <Link href={`${routeOf(194)}?id=${t.id}`} className="btn text">
                    View
                  </Link>
                </div>
              ))
            ) : (
              <Empty>{trips.loading ? "Loading…" : (trips.error ?? "No trip sheets for today yet. Generate them on the Trip Sheet screen.")}</Empty>
            )}
          </Panel>
        </div>
        {/* Raising fees is money: the school admin's, not the transport manager's. */}
        {isAdmin ? (
        <aside>
          <Panel title="Monthly transport fees">
            <p className="muted">Raise one transport fee for every student on a route for a month, at their stop&apos;s fee. Students already billed for that month are skipped.</p>
            <div style={{ marginTop: 12 }}>
              <Link href="/transport/transport-dashboard?new=1" className="btn" scroll={false}>
                <Icon name="money" className="sm" />
                Raise monthly fees
              </Link>
            </div>
          </Panel>
        </aside>
        ) : null}
      </div>
      <TransportFeesDialog />
    </>
  );
}

/** POST /transport/fees/generate: one fee per active assignment for the month (the API skips anyone already billed). */
export function TransportFeesDialog() {
  const [open, close] = useNewFlag();
  const heads = useApi<FeeHead[]>(open ? "/api/v1/school/fees/heads" : null, { active_only: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const period = formText(f, "period");
    if (!(await ask(`Raise the ${period ?? "month's"} transport fee for every student on a route? Anyone already billed for it is skipped.`))) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<{ period: string; created: number; skipped: number; total_amount: string }>(`${TRANSPORT}/fees/generate`, {
        fee_head_id: formNum(f, "fee_head_id"),
        period,
        due_day: formNum(f, "due_day") ?? 10,
      });
      notify(`Raised ${r.created} transport fee(s) for ${r.period} totalling ${money(r.total_amount)}${r.skipped ? ` · ${r.skipped} skipped (already billed or no fee)` : ""}.`);
      close();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Raise monthly transport fees"
      onClose={close}
      onSubmit={submit}
      actions={
        <>
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Raising…" : "Raise fees"}
          </button>
        </>
      }
    >
      <ErrorNote>{error ?? heads.error}</ErrorNote>
      <div className="form-grid">
        <Field label="Fee type" required>
          <select name="fee_head_id" required defaultValue="">
            <option value="">{heads.loading ? "Loading fee types…" : "Select fee type"}</option>
            {heads.data?.map((h) => (
              <option key={h.id} value={h.id}>
                {`${h.name} (${h.code})`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Month" required>
          <input type="month" name="period" required defaultValue={today().slice(0, 7)} />
        </Field>
        <Field label="Due on day">
          <input type="number" name="due_day" min={1} max={31} defaultValue={10} />
        </Field>
      </div>
      <p className="muted small">Each student on a route is billed their stop&apos;s monthly fee (or the route&apos;s). Students already billed for this month, or with no fee set, are skipped, so running it twice is safe. A due day past the month's end falls on its last day.</p>
    </Dialog>
  );
}
