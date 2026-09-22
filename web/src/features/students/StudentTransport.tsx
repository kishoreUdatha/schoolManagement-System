"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { dateTime, initials, label, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { StudentFrame, clock, today } from "./StudentFrame";
import type { TransportAssignment, TransportRoute, Trip, Vehicle } from "./records";
import type { StudentProfile } from "./types";

/**
 * SCR-066, live: GET /transport/assignments?search={admission no.} (the
 * child's current seat), /transport/routes/{id} (stops), /transport/vehicles/{id}
 * (bus, driver and its last GPS position), /transport/trips?route_id=&on=today
 * (boarding). The map is drawn from the stops' coordinates, to scale.
 */
export function StudentTransport() {
  return <StudentFrame active={66}>{(s) => <Body s={s} />}</StudentFrame>;
}

function Body({ s }: { s: StudentProfile }) {
  // The list has no student filter; search by admission number and match the id.
  const seats = useApi<TransportAssignment[]>("/api/v1/school/transport/assignments", { search: s.admission_no });
  const seat = seats.data?.find((a) => a.student_id === s.id && !a.end_date);
  const route = useApi<TransportRoute>(seat ? `/api/v1/school/transport/routes/${seat.route_id}` : null);
  const vehicleId = route.data?.vehicle_id;
  const vehicle = useApi<Vehicle>(vehicleId ? `/api/v1/school/transport/vehicles/${vehicleId}` : null);
  const trips = useApi<Trip[]>(seat ? "/api/v1/school/transport/trips" : null, { route_id: seat?.route_id, on: today() });

  if (seats.loading && !seats.data) return <Panel title="Transport">Loading transport…</Panel>;
  if (!seat) {
    return (
      <>
        <ErrorNote>{seats.error}</ErrorNote>
        <Panel title="Transport" sub={s.full_name}>
          <p className="muted" style={{ marginBottom: 14 }}>
            This student is not assigned to a school bus route.
          </p>
          <Link href="/transport/student-route-assignment" className="btn primary">
            <Icon name="arrow" className="sm" />
            Assign a route
          </Link>
        </Panel>
      </>
    );
  }

  const stops = [...(route.data?.stops ?? [])].sort((a, b) => a.sequence - b.sequence);
  const pickup = trips.data?.find((t) => t.direction === "pickup") ?? trips.data?.[0];
  const stats = [
    { label: "Students assigned", value: route.data ? String(route.data.student_count) : "…", note: seat.route_name },
    {
      label: "Boarded today",
      value: pickup ? String(pickup.boarded) : "—",
      note: pickup ? `${Math.max(pickup.expected - pickup.boarded - pickup.absent, 0)} remaining · ${label(pickup.status)}` : "No trip scheduled today",
    },
    { label: "Stop", value: seat.stop_name, note: `Pickup ${clock(seat.pickup_time)}` },
    { label: "Drop", value: clock(seat.drop_time), note: `${label(seat.direction)} · ${money(seat.monthly_fee)} a month` },
  ];

  return (
    <>
      <ErrorNote>{route.error ?? trips.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <div className="two-col">
        <div>
          <Panel title="Route map" sub={vehicle.data?.last_location_at ? `Bus last reported ${dateTime(vehicle.data.last_location_at)}` : "Stops in order"} flush>
            <RouteMap stops={stops} mine={seat.stop_id} bus={vehicle.data?.last_lat != null && vehicle.data?.last_lng != null ? { lat: vehicle.data.last_lat, lng: vehicle.data.last_lng } : null} />
          </Panel>
          <div className="gap" />
          <Panel title="Route stops" sub={`${seat.route_name}${route.data?.code ? ` · ${route.data.code}` : ""}`} action={pickup ? <Badge>{label(pickup.status)}</Badge> : undefined}>
            {stops.map((st) => (
              <div key={st.id} className={`route-stop ${st.id === seat.stop_id ? "done" : ""}`}>
                <span>{st.id === seat.stop_id ? <Icon name="pin" className="sm" /> : st.sequence}</span>
                <div>
                  <strong>{st.name}</strong>
                  <p>{`Pickup ${clock(st.pickup_time)} · Drop ${clock(st.drop_time)} · ${st.student_count} ${st.student_count === 1 ? "student" : "students"}${st.id === seat.stop_id ? " · this student's stop" : ""}`}</p>
                </div>
              </div>
            ))}
            {!stops.length ? <p className="muted">{route.loading ? "Loading stops…" : "No stops on this route."}</p> : null}
          </Panel>
        </div>
        <aside>
          <Panel title="Trip details">
            <div className="spread">
              <div>
                <h3>{`${seat.route_name} · ${seat.stop_name}`}</h3>
                <p className="muted small">{vehicle.data?.registration_no ?? route.data?.vehicle_label ?? "No vehicle assigned"}</p>
              </div>
              {pickup ? <Badge>{label(pickup.status)}</Badge> : null}
            </div>
            <div className="gap" />
            {vehicle.data?.driver_name ? (
              <div className="person">
                <span className="avatar mint">{initials(vehicle.data.driver_name)}</span>
                <div>
                  {vehicle.data.driver_name}
                  <small>{`Driver${vehicle.data.driver_phone ? ` · ${vehicle.data.driver_phone}` : ""}`}</small>
                </div>
              </div>
            ) : (
              <p className="muted small">No driver assigned.</p>
            )}
            <div className="gap" />
            {(trips.data ?? []).map((t) => (
              <div key={t.id} className={`route-stop ${t.status === "completed" ? "done" : ""}`}>
                <span>{t.status === "completed" ? <Icon name="check" className="sm" /> : <Icon name="bus" className="sm" />}</span>
                <div>
                  <strong>{`${label(t.direction)} trip`}</strong>
                  <p>{`${label(t.status)} · ${t.boarded} of ${t.expected} boarded${t.absent ? ` · ${t.absent} absent` : ""}`}</p>
                </div>
              </div>
            ))}
            {trips.data && !trips.data.length ? <p className="muted small">No trips scheduled for today.</p> : null}
          </Panel>
        </aside>
      </div>
    </>
  );
}

type MapStop = TransportRoute["stops"][number];

/** The route drawn to scale from its stops' coordinates (north up, no street map), with the bus if it has reported. */
function RouteMap({ stops, mine, bus }: { stops: MapStop[]; mine: number; bus: { lat: number; lng: number } | null }) {
  const placed = stops.filter((s): s is MapStop & { lat: number; lng: number } => s.lat != null && s.lng != null);
  if (!placed.length) {
    return (
      <div className="map-canvas">
        <svg viewBox="0 0 760 360" className="map-svg" role="img" aria-label="No stop positions">
          <rect width="760" height="360" fill="#ecf3ed" />
          <text x="380" y="180" textAnchor="middle" fill="#5b7793" fontSize="14" fontFamily="Manrope">
            The stops have no map positions yet
          </text>
        </svg>
        <span className="map-key">Add each stop&apos;s latitude and longitude on the route to draw the map</span>
      </div>
    );
  }
  const all = [...placed, ...(bus ? [bus] : [])];
  const lats = all.map((p) => p.lat);
  const lngs = all.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const span = Math.max(maxLat - minLat, maxLng - minLng, 0.002);
  const xy = (p: { lat: number; lng: number }) => [60 + ((p.lng - minLng) / span) * 640, 320 - ((p.lat - minLat) / span) * 280];
  const line = placed.map((p) => xy(p).join(" ")).join(" L ");
  return (
    <div className="map-canvas">
      <svg viewBox="0 0 760 360" className="map-svg" role="img" aria-label="Route map">
        <rect width="760" height="360" fill="#ecf3ed" />
        {placed.length > 1 ? <path d={`M ${line}`} stroke="#2563eb" strokeWidth="4" fill="none" strokeDasharray="2 0" /> : null}
        {placed.map((s) => {
          const [x, y] = xy(s);
          const here = s.id === mine;
          return (
            <g key={s.id}>
              <circle cx={x} cy={y} r={here ? 11 : 7} fill={here ? "#16a34a" : "#fff"} stroke="#2563eb" strokeWidth="3" />
              <text x={x + 12} y={y - 10} fontSize="12" fill="#1f2d3d" fontFamily="Manrope">{`${s.sequence}. ${s.name}`}</text>
            </g>
          );
        })}
        {bus
          ? (() => {
              const [bx, by] = xy(bus);
              return (
                <g>
                  <rect x={bx - 14} y={by - 11} width="28" height="22" rx="5" fill="#f59e0b" />
                  <rect x={bx - 8} y={by - 7} width="16" height="8" rx="2" fill="white" />
                </g>
              );
            })()
          : null}
      </svg>
      <span className="map-key">{`${placed.length} of ${stops.length} stop(s) placed · green is this student's stop${bus ? " · amber is the bus" : ""} · north up, to scale`}</span>
    </div>
  );
}
