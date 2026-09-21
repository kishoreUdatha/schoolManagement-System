"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Avatar, Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, Kv, ago, minutesSince, time12, today } from "./kit";
import type { LocationPoint, Route, Trip, TripDetail, TripStudent, Vehicle } from "./types";

const TRIPS = "/api/v1/school/transport/trips";
const tripName = (t: Trip) => `${t.route_name} · ${t.direction === "pickup" ? "Morning pickup" : "Afternoon drop"}`;
const STATUS: Record<Trip["status"], string> = { scheduled: "Scheduled", in_progress: "In transit", completed: "Completed", cancelled: "Cancelled" };

/** The day's trips, to pick one from (both trip screens open on this when no ?id= is given). */
function TripPicker({ screen }: { screen: number }) {
  const router = useRouter();
  const [day, setDay] = useState(today());
  const trips = useApi<Trip[]>(TRIPS, { on: day });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = trips.data ?? [];

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ created: number }>(`${TRIPS}/generate`, undefined, { on: day });
      notify(r.created ? `Created ${r.created} trip sheet(s).` : "Trip sheets already exist for this day.");
      trips.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const rows: Row[] = items.map((t) => [tripName(t), t.vehicle_label ?? "—", t.driver_name ?? "—", `${t.boarded} / ${t.expected}`, String(t.absent), STATUS[t.status]]);
  return (
    <>
      <div className="filterbar">
        <input type="date" aria-label="Trip date" value={day} onChange={(e) => setDay(e.target.value || today())} />
        <button type="button" className="btn" onClick={generate} disabled={busy}>
          <Icon name="calendar" className="sm" />
          {busy ? "Generating…" : "Generate trip sheets for this day"}
        </button>
      </div>
      <ErrorNote>{error ?? trips.error}</ErrorNote>
      <Panel title="Trips" sub={`${date(day)} · choose a trip to open its sheet`} flush>
        <DataTable
          columns={["Trip", "Vehicle", "Driver", "Boarded", "Absent", "Status"]}
          rows={rows}
          selectable={false}
          onView={(i) => router.push(`${routeOf(screen)}?id=${items[i].id}`)}
          empty={trips.loading ? "Loading trips…" : "No trip sheets for this day. Generate them from the active routes."}
        />
      </Panel>
    </>
  );
}

function useTrip() {
  const id = useSearchParams().get("id");
  const trip = useApi<TripDetail>(id ? `${TRIPS}/${id}` : null);
  const route = useApi<Route>(trip.data ? `/api/v1/school/transport/routes/${trip.data.route_id}` : null);
  return { id, trip, route };
}

function tripStats(t: TripDetail) {
  const dropped = t.students.filter((s) => s.status === "dropped").length;
  const boarded = t.students.filter((s) => s.status === "boarded" || s.status === "dropped").length;
  const absent = t.students.filter((s) => s.status === "absent").length;
  const unmarked = t.students.length - boarded - absent;
  return [
    { label: "Assigned", value: String(t.expected), note: t.route_name },
    { label: "Boarded", value: String(boarded), note: "Marked on the sheet" },
    { label: "Not boarded", value: String(absent + unmarked), note: `${absent} absent · ${unmarked} not marked` },
    { label: "Dropped", value: String(dropped), note: t.direction === "pickup" ? "At school" : "At their stop" },
  ];
}

const stopTime = (route: Route | null, s: TripStudent, dir: Trip["direction"]) => {
  const stop = route?.stops.find((x) => x.id === s.stop_id);
  return time12(dir === "pickup" ? stop?.pickup_time : stop?.drop_time);
};

/** SCR-194, live: GET /transport/trips (?on=), POST …/generate, GET + PATCH /transport/trips/{id} (start, complete, odometer). */
export function TripSheet() {
  const { id, trip, route } = useTrip();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!id) return <TripPicker screen={194} />;
  if (trip.loading && !trip.data) return <Loading what="Loading the trip sheet…" />;
  const t = trip.data;
  if (!t) return <ErrorNote>{trip.error ?? "Trip not found."}</ErrorNote>;

  async function patch(body: Record<string, unknown>, done: string) {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`${TRIPS}/${t!.id}`, body);
      notify(done);
      trip.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  function saveOdo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (String(f.get(k) ?? "") === "" ? null : Number(f.get(k)));
    patch({ start_odometer_km: num("start"), end_odometer_km: num("end"), notes: String(f.get("notes") ?? "").trim() || null }, "Trip sheet saved.");
  }

  const statusButton =
    t.status === "scheduled" ? (
      <button type="button" className="btn primary" disabled={saving} onClick={() => patch({ status: "in_progress" }, "Trip started.")}>
        <Icon name="check" className="sm" />
        Start trip
      </button>
    ) : t.status === "in_progress" ? (
      <button type="button" className="btn primary" disabled={saving} onClick={() => patch({ status: "completed" }, "Trip completed.")}>
        <Icon name="check" className="sm" />
        Complete trip
      </button>
    ) : t.status === "cancelled" ? (
      <button type="button" className="btn" disabled={saving} onClick={() => patch({ status: "scheduled" }, "Trip restored.")}>
        Restore trip
      </button>
    ) : null;

  return (
    <>
      <StatStrip items={tripStats(t)} compact />
      <ErrorNote>{error ?? route.error}</ErrorNote>
      <div className="two-col">
        <Panel
          title={tripName(t)}
          sub={`${date(t.trip_date)} · ${t.vehicle_label ?? "No vehicle"} · ${t.driver_name ?? "No driver"}`}
          action={
            <div className="row">
              <Badge>{STATUS[t.status]}</Badge>
              {statusButton}
            </div>
          }
          flush
        >
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Stop</th>
                  <th>{t.direction === "pickup" ? "Pickup time" : "Drop time"}</th>
                  <th>Status</th>
                  <th>Marked at</th>
                </tr>
              </thead>
              <tbody>
                {t.students.map((s, i) => (
                  <tr key={s.student_id}>
                    <td>
                      <div className="person">
                        <Avatar name={s.student_name} index={i} />
                        <div>{s.student_name}</div>
                      </div>
                    </td>
                    <td>{s.section_label ?? "—"}</td>
                    <td>{s.stop_name}</td>
                    <td>{stopTime(route.data, s, t.direction)}</td>
                    <td>{s.status ? <Badge>{label(s.status)}</Badge> : "Not marked"}</td>
                    <td>{s.marked_at ? dateTime(s.marked_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!t.students.length ? <div className="table-empty">No students ride this trip.</div> : null}
          <div className="table-footer">
            <span>{`${t.students.length} student(s) on this sheet`}</span>
            <Link href={`${routeOf(196)}?id=${t.id}`} className="btn">
              Mark boarding
            </Link>
          </div>
        </Panel>
        <aside className="stack">
          <Panel title="Trip log">
            <Kv
              rows={[
                ["Started", dateTime(t.started_at)],
                ["Ended", dateTime(t.ended_at)],
                ["Distance", t.distance_km !== null ? `${t.distance_km} km` : "—"],
              ]}
            />
            <div className="gap" />
            <form onSubmit={saveOdo} key={`${t.start_odometer_km}-${t.end_odometer_km}-${t.notes}`}>
              <div className="form-grid">
                <Field label="Start odometer (km)">
                  <input type="number" min={0} name="start" defaultValue={t.start_odometer_km ?? ""} />
                </Field>
                <Field label="End odometer (km)">
                  <input type="number" min={0} name="end" defaultValue={t.end_odometer_km ?? ""} />
                </Field>
                <Field label="Notes" full>
                  <input name="notes" defaultValue={t.notes ?? ""} />
                </Field>
              </div>
              <div className="gap" />
              <div className="row">
                <button type="submit" className="btn" disabled={saving}>
                  Save log
                </button>
                {t.status === "scheduled" || t.status === "in_progress" ? (
                  <button type="button" className="btn" disabled={saving} onClick={() => window.confirm("Cancel this trip?") && patch({ status: "cancelled" }, "Trip cancelled.")}>
                    Cancel trip
                  </button>
                ) : null}
              </div>
            </form>
          </Panel>
          <Link href={routeOf(194)} className="btn">
            <Icon name="arrow" className="sm" />
            All trips
          </Link>
        </aside>
      </div>
    </>
  );
}

type Mark = "boarded" | "dropped" | "absent" | null;

/** SCR-196, live: GET /transport/trips/{id} and POST …/boarding with the changed marks. */
export function BoardingAttendance() {
  const { id, trip, route } = useTrip();
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = trip.data;

  useEffect(() => {
    if (t) setMarks(Object.fromEntries(t.students.map((s) => [s.student_id, s.status])));
  }, [t]);

  const changed = useMemo(() => (t ? t.students.filter((s) => (marks[s.student_id] ?? null) !== s.status && marks[s.student_id]) : []), [t, marks]);

  if (!id) return <TripPicker screen={196} />;
  if (trip.loading && !t) return <Loading what="Loading the trip…" />;
  if (!t) return <ErrorNote>{trip.error ?? "Trip not found."}</ErrorNote>;
  const editable = t.status === "scheduled" || t.status === "in_progress";

  const set = (sid: number, col: "boarded" | "dropped" | "absent", on: boolean) =>
    setMarks((m) => {
      const cur = m[sid];
      let next: Mark = cur;
      if (col === "absent") next = on ? "absent" : null;
      if (col === "boarded") next = on ? (cur === "dropped" ? "dropped" : "boarded") : null;
      if (col === "dropped") next = on ? "dropped" : cur === "dropped" ? "boarded" : cur;
      return { ...m, [sid]: next };
    });

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!changed.length) {
      notify("Nothing new to save.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`${TRIPS}/${t!.id}/boarding`, { marks: changed.map((s) => ({ student_id: s.student_id, status: marks[s.student_id] })) });
      notify(`Saved ${changed.length} mark(s).`);
      trip.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const live: TripDetail = { ...t, students: t.students.map((s) => ({ ...s, status: marks[s.student_id] ?? null })) };
  return (
    <>
      <StatStrip items={tripStats(live)} compact />
      <ErrorNote>{error}</ErrorNote>
      {!editable ? <div className="tip">{`This trip is ${STATUS[t.status].toLowerCase()}; its marks can no longer change.`}</div> : null}
      <form id="boarding-form" onSubmit={save}>
        <Panel title={tripName(t)} sub={`${date(t.trip_date)} · ${t.vehicle_label ?? "No vehicle"} · ${t.driver_name ?? "No driver"}`} action={<Badge>{STATUS[t.status]}</Badge>} flush>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Stop</th>
                  <th>{t.direction === "pickup" ? "Pickup time" : "Drop time"}</th>
                  <th>Boarded</th>
                  <th>Dropped</th>
                  <th>Absent</th>
                </tr>
              </thead>
              <tbody>
                {t.students.map((s, i) => {
                  const m = marks[s.student_id] ?? null;
                  return (
                    <tr key={s.student_id}>
                      <td>
                        <div className="person">
                          <Avatar name={s.student_name} index={i} />
                          <div>{s.student_name}</div>
                        </div>
                      </td>
                      <td>{s.section_label ?? "—"}</td>
                      <td>{s.stop_name}</td>
                      <td>{stopTime(route.data, s, t.direction)}</td>
                      <td>
                        <input type="checkbox" aria-label={`Boarded ${s.student_name}`} disabled={!editable} checked={m === "boarded" || m === "dropped"} onChange={(e) => set(s.student_id, "boarded", e.target.checked)} />
                      </td>
                      <td>
                        <input type="checkbox" aria-label={`Dropped ${s.student_name}`} disabled={!editable} checked={m === "dropped"} onChange={(e) => set(s.student_id, "dropped", e.target.checked)} />
                      </td>
                      <td>
                        <input type="checkbox" aria-label={`Absent ${s.student_name}`} disabled={!editable} checked={m === "absent"} onChange={(e) => set(s.student_id, "absent", e.target.checked)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!t.students.length ? <div className="table-empty">No students ride this trip.</div> : null}
          <div className="table-footer">
            <span>{changed.length ? `${changed.length} unsaved change(s)` : "All marks saved"}</span>
            <div className="row">
              {editable ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setMarks((mk) => ({ ...mk, ...Object.fromEntries(t.students.filter((s) => !mk[s.student_id]).map((s) => [s.student_id, t.direction === "pickup" ? "boarded" : "dropped"])) }))}
                >
                  {`Mark remaining ${t.direction === "pickup" ? "boarded" : "dropped"}`}
                </button>
              ) : null}
              <Link href={`${routeOf(194)}?id=${t.id}`} className="btn">
                Trip sheet
              </Link>
            </div>
          </div>
        </Panel>
      </form>
      {saving ? <p className="muted">Saving…</p> : null}
    </>
  );
}

/** A reading older than this is where the bus was, not where it is. */
const STALE_MINUTES = 15;

/** SCR-195, live: last reported positions from GET /transport/vehicles, today's track from …/locations, and today's trip. */
export function LiveTracking() {
  const vehicles = useApi<Vehicle[]>("/api/v1/school/transport/vehicles");
  const routes = useApi<Route[]>("/api/v1/school/transport/routes");
  const [pick, setPick] = useState("");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const active = useMemo(() => (vehicles.data ?? []).filter((v) => v.is_active), [vehicles.data]);
  useEffect(() => {
    if (vehicles.data) setCheckedAt(new Date());
    if (!pick && active.length) {
      const freshest = [...active].sort((a, b) => (b.last_location_at ?? "").localeCompare(a.last_location_at ?? ""))[0];
      setPick(String(freshest.id));
    }
  }, [vehicles.data, active, pick]);

  const v = active.find((x) => String(x.id) === pick);
  const route = routes.data?.find((r) => r.vehicle_id === v?.id);
  const track = useApi<LocationPoint[]>(v ? `/api/v1/school/transport/vehicles/${v.id}/locations` : null, { on: today() });
  const trips = useApi<Trip[]>(route ? TRIPS : null, { on: today(), route_id: route?.id });
  const trip = trips.data?.find((x) => x.status === "in_progress") ?? null;

  const mins = minutesSince(v?.last_location_at);
  const stale = mins === null || mins > STALE_MINUTES;
  const state = !v ? "—" : !v.gps_enabled ? "No GPS" : mins === null ? "No position yet" : stale ? "Stale" : "Reporting";

  const stats = [
    { label: "Students assigned", value: v ? String(v.assigned_students) : "…", note: route ? route.name : "No route" },
    { label: "Boarded", value: trip ? String(trip.boarded) : "—", note: trip ? `${trip.expected - trip.boarded} remaining · ${tripName(trip)}` : "No trip in transit" },
    { label: "Last position", value: mins === null ? "—" : ago(mins), note: v?.last_location_at ? dateTime(v.last_location_at) : "Nothing reported" },
    { label: "Last speed", value: v?.last_speed_kmph !== null && v?.last_speed_kmph !== undefined ? `${Math.round(v.last_speed_kmph)} km/h` : "—", note: stale ? "Stale reading — not current" : "At the last report" },
  ];

  return (
    <>
      <div className="filterbar">
        <select aria-label="Vehicle" value={pick} onChange={(e) => setPick(e.target.value)}>
          {active.map((x) => (
            <option key={x.id} value={x.id}>
              {`${x.registration_no}${x.label ? ` · ${x.label}` : ""}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          onClick={() => {
            vehicles.reload();
            track.reload();
            trips.reload();
          }}
        >
          <Icon name="clock" className="sm" />
          {`Check again${checkedAt ? ` · checked ${checkedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}`}
        </button>
      </div>
      <StatStrip items={stats} compact />
      <ErrorNote>{vehicles.error ?? routes.error ?? track.error}</ErrorNote>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>{`This is the last position the vehicle's tracker reported, not a live feed. A reading more than ${STALE_MINUTES} minutes old is marked stale. The system does not estimate arrival times.`}</span>
      </div>
      <div className="two-col">
        <div>
          <Panel title={route ? route.name : v ? v.registration_no : "Vehicle"} sub={`${v?.registration_no ?? ""}${route ? ` · ${route.code}` : ""}`} action={<Badge>{state}</Badge>} flush>
            <TrackMap points={track.data ?? []} last={v && v.last_lat !== null && v.last_lng !== null ? { lat: v.last_lat, lng: v.last_lng } : null} stale={stale} />
          </Panel>
        </div>
        <aside>
          <Panel title="Trip details">
            <div className="spread">
              <div>
                <h3>{route ? `${route.code} · ${route.name}` : "No route assigned"}</h3>
                <p className="muted small">{v?.registration_no ?? "—"}</p>
              </div>
              <Badge>{trip ? STATUS[trip.status] : "No trip in transit"}</Badge>
            </div>
            <div className="gap" />
            {v?.driver_name ? (
              <div className="person">
                <Avatar name={v.driver_name} />
                <div>
                  {v.driver_name}
                  <small>{`Driver${v.driver_phone ? ` · ${v.driver_phone}` : ""}`}</small>
                </div>
              </div>
            ) : (
              <p className="muted">No driver assigned.</p>
            )}
            <div className="gap" />
            {/* Scheduled stop times only: the API does not report which stop the bus has reached, so no stop is shown as done or next. */}
            {route?.stops.map((s) => (
              <div className="route-stop" key={s.id}>
                <span>{s.sequence}</span>
                <div>
                  <strong>{s.name}</strong>
                  <p>{`${time12(s.pickup_time)} pickup · ${time12(s.drop_time)} drop · scheduled`}</p>
                </div>
              </div>
            ))}
            {v?.last_lat !== null && v?.last_lat !== undefined && v.last_lng !== null ? (
              <>
                <div className="gap" />
                <a className="btn" href={`https://www.openstreetmap.org/?mlat=${v.last_lat}&mlon=${v.last_lng}#map=16/${v.last_lat}/${v.last_lng}`} target="_blank" rel="noreferrer">
                  <Icon name="pin" className="sm" />
                  Open last position on a map
                </a>
              </>
            ) : null}
            {trip ? (
              <>
                <div className="gap" />
                <Link href={`${routeOf(194)}?id=${trip.id}`} className="btn">
                  Open trip sheet
                </Link>
              </>
            ) : null}
          </Panel>
        </aside>
      </div>
    </>
  );
}

/** Today's reported points drawn to scale inside the mock's map canvas (no base map). */
function TrackMap({ points, last, stale }: { points: LocationPoint[]; last: { lat: number; lng: number } | null; stale: boolean }) {
  const all = [...points.map((p) => ({ lat: p.lat, lng: p.lng })), ...(last ? [last] : [])];
  if (!all.length) {
    return (
      <div className="map-canvas">
        <svg viewBox="0 0 760 520" className="map-svg" role="img" aria-label="No positions reported">
          <rect width="760" height="520" fill="#ecf3ed" />
          <text x="380" y="260" textAnchor="middle" fill="#5b7793" fontSize="14" fontFamily="Manrope">
            No position reported today
          </text>
        </svg>
        <span className="map-key">No GPS readings for this vehicle today</span>
      </div>
    );
  }
  const lats = all.map((p) => p.lat);
  const lngs = all.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const span = Math.max(maxLat - minLat, maxLng - minLng, 0.002);
  const xy = (p: { lat: number; lng: number }) => [60 + ((p.lng - minLng) / span) * 640, 460 - ((p.lat - minLat) / span) * 400];
  const line = points.map((p) => xy(p).join(" ")).join(" L ");
  const [bx, by] = xy(last ?? all[all.length - 1]);
  return (
    <div className="map-canvas">
      <svg viewBox="0 0 760 520" className="map-svg" role="img" aria-label="Positions reported today">
        <rect width="760" height="520" fill="#ecf3ed" />
        {points.length > 1 ? <path d={`M ${line}`} stroke="#2563eb" strokeWidth="5" fill="none" /> : null}
        <circle cx={bx} cy={by} r="23" fill="#fff" opacity={stale ? 0.6 : 1} />
        <rect x={bx - 14} y={by - 11} width="28" height="22" rx="5" fill={stale ? "#8a9bb3" : "#2563eb"} />
        <rect x={bx - 8} y={by - 7} width="16" height="8" rx="2" fill="white" />
      </svg>
      <span className="map-key">{`${points.length} reading(s) today · north up, to scale, no street map${stale ? " · last reading is stale" : ""}`}</span>
    </div>
  );
}
