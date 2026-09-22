"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, Kv, SearchBox, time12 } from "./kit";
import type { Route, Vehicle } from "./types";

import { ask } from "@/lib/dialog";
const ROUTES = "/api/v1/school/transport/routes";

/** The driven distance when recorded, else the stop-to-stop straight line. */
const km = (r: Route) => (r.distance_km ? `${Number(r.distance_km)} km` : r.stops_distance_km !== null ? `~${r.stops_distance_km} km (straight line)` : "—");

/** SCR-189, live: GET /transport/routes. */
export function RouteList() {
  const router = useRouter();
  const routes = useApi<Route[]>(ROUTES);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const all = routes.data ?? [];
  const items = all.filter((r) => {
    const q = search.trim().toLowerCase();
    return (
      (!q || [r.name, r.code, r.vehicle_label, ...r.stops.map((s) => s.name)].some((x) => x?.toLowerCase().includes(q))) &&
      (!status || (status === "active") === r.is_active)
    );
  });
  const rows: Row[] = items.map((r) => [
    `${r.code} · ${r.name}`,
    r.vehicle_label ?? "—",
    String(r.stops.length),
    km(r),
    r.vehicle_capacity ? `${r.student_count} / ${r.vehicle_capacity}` : String(r.student_count),
    money(r.monthly_fee),
    r.is_active ? "Active" : "Inactive",
  ]);
  return (
    <>
      <div className="filterbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search routes…" />
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{routes.error}</ErrorNote>
      <Panel title="All routes" sub={routes.data ? `${all.length} route(s) · ${all.reduce((s, r) => s + r.stops.length, 0)} stops · ${all.reduce((s, r) => s + r.student_count, 0)} student(s)` : "Loading…"} flush>
        <DataTable
          columns={["Route", "Vehicle", "Stops", "Distance", "Students", "Fee / month", "Status"]}
          rows={rows}
          onView={(i) => router.push(`${routeOf(190)}?id=${items[i].id}`)}
          empty={routes.loading ? "Loading routes…" : all.length ? "No routes match these filters." : "No routes yet. Create the first one."}
        />
      </Panel>
    </>
  );
}

type StopForm = { key: number; id?: number; name: string; pickup_time: string; drop_time: string; monthly_fee: string; lat: string; lng: string };
let seq = 0;
const blankStop = (): StopForm => ({ key: ++seq, name: "", pickup_time: "", drop_time: "", monthly_fee: "", lat: "", lng: "" });

/** SCR-190, live: POST /transport/routes, or GET + PATCH /transport/routes/{id} (?id=) with ordered stops. */
export function RouteBuilder() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const existing = useApi<Route>(id ? `${ROUTES}/${id}` : null);
  const vehicles = useApi<Vehicle[]>("/api/v1/school/transport/vehicles");
  const [stops, setStops] = useState<StopForm[]>(() => [blankStop()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = existing.data;

  useEffect(() => {
    if (!r) return;
    setStops(
      r.stops.map((s) => ({
        key: ++seq,
        id: s.id,
        name: s.name,
        pickup_time: s.pickup_time?.slice(0, 5) ?? "",
        drop_time: s.drop_time?.slice(0, 5) ?? "",
        monthly_fee: s.monthly_fee ?? "",
        lat: s.lat?.toString() ?? "",
        lng: s.lng?.toString() ?? "",
      })),
    );
  }, [r]);

  if (id && existing.loading && !r) return <Loading what="Loading the route…" />;

  const change = (i: number, patch: Partial<StopForm>) => setStops(stops.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= stops.length) return;
    const next = [...stops];
    [next[i], next[j]] = [next[j], next[i]];
    setStops(next);
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      name: String(f.get("name")).trim(),
      code: String(f.get("code")).trim(),
      vehicle_id: f.get("vehicle_id") ? Number(f.get("vehicle_id")) : null,
      monthly_fee: String(f.get("monthly_fee") || "0"),
      distance_km: f.get("distance_km") ? String(f.get("distance_km")) : null,
      stops: stops
        .filter((s) => s.name.trim())
        .map((s) => ({
          id: s.id,
          name: s.name.trim(),
          pickup_time: s.pickup_time || null,
          drop_time: s.drop_time || null,
          monthly_fee: s.monthly_fee === "" ? null : s.monthly_fee,
          lat: s.lat === "" ? null : Number(s.lat),
          lng: s.lng === "" ? null : Number(s.lng),
        })),
    };
    setSaving(true);
    setError(null);
    try {
      if (id) {
        await api.patch(`${ROUTES}/${id}`, { ...payload, is_active: f.get("status") === "active" });
        notify("Route saved.");
        existing.reload();
      } else {
        const created = await api.post<Route>(ROUTES, payload);
        notify("Route created.");
        router.replace(`${routeOf(190)}?id=${created.id}`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!r || !(await ask(`Delete ${r.name}? Students must be moved off it first.`))) return;
    try {
      await api.delete(`${ROUTES}/${r.id}`);
      notify("Route deleted.");
      router.push(routeOf(189));
    } catch (err) {
      setError(errorText(err));
    }
  }

  const named = stops.filter((s) => s.name.trim());
  const vehicleList = vehicles.data ?? [];

  return (
    <>
      <div className="two-col">
        <form id="route-form" className="panel" onSubmit={submit}>
          <div className="panel-pad">
            <ErrorNote>{error ?? existing.error ?? vehicles.error}</ErrorNote>
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Details</h3>
                </div>
                <div className="form-grid" key={r?.id ?? "new"}>
                  <Field label="Route name" required>
                    <input name="name" required defaultValue={r?.name ?? ""} placeholder="Enter route name" />
                  </Field>
                  <Field label="Route code" required>
                    <input name="code" required defaultValue={r?.code ?? ""} placeholder="e.g. RT-NORTH" />
                  </Field>
                  <Field label="Vehicle">
                    <select name="vehicle_id" defaultValue={r?.vehicle_id ?? ""}>
                      <option value="">{vehicles.loading ? "Loading vehicles…" : "No vehicle yet"}</option>
                      {vehicleList.map((v) => (
                        <option key={v.id} value={v.id}>
                          {`${v.registration_no}${v.label ? ` · ${v.label}` : ""} (${v.capacity} seats)`}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Monthly fee (₹)" required>
                    <input name="monthly_fee" type="number" min={0} step="0.01" required defaultValue={r?.monthly_fee ?? ""} />
                  </Field>
                  <Field label="Distance (km, one way)">
                    <input
                      name="distance_km"
                      type="number"
                      min={0}
                      max={1000}
                      step="0.1"
                      defaultValue={r?.distance_km ?? ""}
                      placeholder={r?.stops_distance_km ? `~${r.stops_distance_km} km between stops` : "As driven"}
                    />
                  </Field>
                  {id ? (
                    <Field label="Status">
                      <select name="status" defaultValue={r?.is_active === false ? "inactive" : "active"}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </Field>
                  ) : null}
                </div>
              </section>
              <section>
                <div className="form-section-title">
                  <span className="number">02</span>
                  <h3>Stops, in order</h3>
                </div>
                {stops.map((s, i) => (
                  <div className="form-grid" key={s.key} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid var(--line)" }}>
                    <Field label={`Stop ${i + 1}`}>
                      <input value={s.name} onChange={(e) => change(i, { name: e.target.value })} placeholder="Stop name" />
                    </Field>
                    <Field label="Stop fee override (₹)">
                      <input type="number" min={0} step="0.01" value={s.monthly_fee} onChange={(e) => change(i, { monthly_fee: e.target.value })} placeholder="Route fee" />
                    </Field>
                    <Field label="Pickup time">
                      <input type="time" value={s.pickup_time} onChange={(e) => change(i, { pickup_time: e.target.value })} />
                    </Field>
                    <Field label="Drop time">
                      <input type="time" value={s.drop_time} onChange={(e) => change(i, { drop_time: e.target.value })} />
                    </Field>
                    <div className="row">
                      <button type="button" className="btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move stop up">
                        ↑
                      </button>
                      <button type="button" className="btn" onClick={() => move(i, 1)} disabled={i === stops.length - 1} aria-label="Move stop down">
                        ↓
                      </button>
                      <button type="button" className="btn" onClick={() => setStops(stops.filter((_, j) => j !== i))}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn" onClick={() => setStops([...stops, blankStop()])}>
                  <Icon name="plus" className="sm" />
                  Add stop
                </button>
              </section>
            </div>
          </div>
          <div className="form-footer">
            <span>Fields marked * are required</span>
            <div className="actions">
              {r ? (
                <button type="button" className="btn" onClick={remove}>
                  Delete route
                </button>
              ) : null}
              <button type="button" className="btn" onClick={() => router.push(routeOf(189))}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                <Icon name="check" className="sm" />
                {saving ? "Saving…" : "Save route"}
              </button>
            </div>
          </div>
        </form>
        <aside className="stack">
          <div className="aside-panel">
            <h3>Transport</h3>
            <Kv
              rows={[
                ["Stops", String(named.length)],
                ["Students on route", r ? String(r.student_count) : "—"],
                ["Seats", r?.vehicle_capacity ? String(r.vehicle_capacity) : "—"],
                ["Status", r ? (r.is_active ? "Active" : "Inactive") : "New route"],
              ]}
            />
            <div className="gap" />
            <p>Stops are saved in the order shown. A stop with students on it cannot be removed until they are moved.</p>
          </div>
        </aside>
      </div>
      <div className="gap" />
      <RoutePreview names={named.map((s) => `${s.name}${s.pickup_time ? ` · ${time12(s.pickup_time)}` : ""}`)} />
    </>
  );
}

/** The mock's route schematic, with the route's own stops spaced along it. */
function RoutePreview({ names }: { names: string[] }) {
  const pts = useMemo(() => {
    const path = [
      [110, 420],
      [210, 305],
      [365, 250],
      [505, 160],
      [670, 75],
    ];
    if (names.length <= 1) return names.map(() => path[0]);
    return names.map((_, i) => {
      const t = (i / (names.length - 1)) * (path.length - 1);
      const k = Math.min(Math.floor(t), path.length - 2);
      const f = t - k;
      return [path[k][0] + (path[k + 1][0] - path[k][0]) * f, path[k][1] + (path[k + 1][1] - path[k][1]) * f];
    });
  }, [names]);
  return (
    <Panel title="Route preview" flush>
      <div className="map-canvas">
        <svg viewBox="0 0 760 520" className="map-svg" role="img" aria-label="Route schematic, not to scale">
          <rect width="760" height="520" fill="#ecf3ed" />
          <path d="M-20 70 780 280M-30 290 650 20M20 500 790 320M180-20 90 550M470-20 380 550M720-20 610 550" stroke="#fff" strokeWidth="28" />
          <path d="M-20 70 780 280M-30 290 650 20M20 500 790 320M180-20 90 550M470-20 380 550M720-20 610 550" stroke="#dfe7ec" strokeWidth="2" />
          <path d="M-10 360 C120 450 340 120 770 240" stroke="#c4e3f4" strokeWidth="38" />
          <path d="M110 420 L210 305 L365 250 L505 160 L670 75" stroke="#fff" strokeWidth="11" fill="none" />
          <path d="M110 420 L210 305 L365 250 L505 160 L670 75" stroke="#2563eb" strokeWidth="6" fill="none" />
          {pts.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="8" fill="white" stroke="#2563eb" strokeWidth="3" />
              <rect x={x - 70} y={y + 15} width="140" height="25" rx="5" fill="#fff" />
              <text x={x} y={y + 31} textAnchor="middle" fill="#5b7793" fontSize="9" fontFamily="Manrope">
                {`${i + 1}. ${names[i]}`.slice(0, 30)}
              </text>
            </g>
          ))}
        </svg>
        <span className="map-key">{names.length ? "Route schematic · stop order, not to scale" : "Add stops to see the route"}</span>
      </div>
    </Panel>
  );
}

/** SCR-191, live: every stop of every route, from GET /transport/routes. */
export function StopList() {
  const router = useRouter();
  const routes = useApi<Route[]>(ROUTES);
  const [search, setSearch] = useState("");
  const [routeId, setRouteId] = useState(useSearchParams().get("route") ?? "");
  const stops = (routes.data ?? [])
    .filter((r) => !routeId || String(r.id) === routeId)
    .flatMap((r) => r.stops.map((s) => ({ ...s, route: r })))
    .filter((s) => {
      const q = search.trim().toLowerCase();
      return !q || s.name.toLowerCase().includes(q) || s.route.name.toLowerCase().includes(q);
    });
  const rows: Row[] = stops.map((s) => [s.name, `${s.route.code} · ${s.route.name}`, String(s.sequence), time12(s.pickup_time), time12(s.drop_time), String(s.student_count)]);
  return (
    <>
      <div className="filterbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search stops…" />
        <select aria-label="Filter by route" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
          <option value="">All routes</option>
          {routes.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {`${r.code} · ${r.name}`}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{routes.error}</ErrorNote>
      <Panel title="All stops" sub="Stops are edited on their route · open one to change its order or times" flush>
        <DataTable
          columns={["Stop", "Route", "Sequence", "Pickup time", "Drop time", "Students"]}
          rows={rows}
          onView={(i) => router.push(`${routeOf(190)}?id=${stops[i].route.id}`)}
          empty={routes.loading ? "Loading stops…" : "No stops yet. Add them on a route."}
        />
      </Panel>
    </>
  );
}
