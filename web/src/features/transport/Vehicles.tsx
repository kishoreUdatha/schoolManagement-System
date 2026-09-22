"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, initials, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, Kv, Modal, ModalActions, SearchBox, formNum, formText, time12, today } from "./kit";
import { KIND_LABEL, type Crew, type LogKind, type Route, type Vehicle, type VehicleLog } from "./types";

import { ask } from "@/lib/dialog";
const VEHICLES = "/api/v1/school/transport/vehicles";
const ROUTES = "/api/v1/school/transport/routes";
const CREW = "/api/v1/school/transport/crew";

const vehicleName = (v: Vehicle) => v.label || v.registration_no;
const statusOf = (v: Vehicle) => (!v.is_active ? "Inactive" : v.expiring_documents.length ? "Renewal due soon" : "Active");
const routeFor = (routes: Route[] | null, vehicleId: number) => routes?.find((r) => r.vehicle_id === vehicleId);

/** SCR-186, live: GET /transport/vehicles with the route each vehicle runs. */
export function VehicleList() {
  const router = useRouter();
  const vehicles = useApi<Vehicle[]>(VEHICLES);
  const routes = useApi<Route[]>(ROUTES);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (vehicles.data ?? []).filter(
      (v) =>
        (!q || [v.registration_no, v.label, v.driver_name, v.make_model].some((x) => x?.toLowerCase().includes(q))) &&
        (!kind || v.kind === kind) &&
        (!status || (status === "active" ? v.is_active : status === "inactive" ? !v.is_active : v.expiring_documents.length > 0)),
    );
  }, [vehicles.data, search, kind, status]);

  const rows: Row[] = items.map((v) => {
    const r = routeFor(routes.data, v.id);
    return [
      { name: vehicleName(v), sub: v.make_model ?? KIND_LABEL[v.kind] },
      v.registration_no,
      String(v.capacity),
      v.driver_name ?? "—",
      r ? `${r.code} · ${r.name}` : "—",
      statusOf(v),
    ];
  });
  const all = vehicles.data ?? [];

  return (
    <>
      <div className="filterbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search vehicles…" />
        <select aria-label="Filter by vehicle type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All vehicle types</option>
          {Object.entries(KIND_LABEL).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="renewal">Documents to renew</option>
        </select>
      </div>
      <ErrorNote>{vehicles.error ?? routes.error}</ErrorNote>
      <Panel
        title="Fleet"
        sub={vehicles.data ? `${all.length} vehicle(s) · ${all.reduce((s, v) => s + v.capacity, 0)} seats · ${all.reduce((s, v) => s + v.assigned_students, 0)} student(s) assigned` : "Loading…"}
        flush
      >
        <DataTable
          columns={["Vehicle", "Registration", "Capacity", "Driver", "Route", "Status"]}
          rows={rows}
          onView={(i) => router.push(`${routeOf(188)}?id=${items[i].id}`)}
          empty={vehicles.loading ? "Loading vehicles…" : all.length ? "No vehicles match these filters." : "No vehicles yet. Add the first one."}
        />
      </Panel>
    </>
  );
}

/** SCR-187, live: POST /transport/vehicles, or GET + PATCH /transport/vehicles/{id} with ?id=. */
export function VehicleForm() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const existing = useApi<Vehicle>(id ? `${VEHICLES}/${id}` : null);
  const crew = useApi<Crew[]>(CREW);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (id && existing.loading && !existing.data) return <Loading what="Loading the vehicle…" />;
  const v = existing.data;
  const drivers = (crew.data ?? []).filter((c) => c.role === "driver" && (c.is_active || c.id === v?.driver_id));
  const conductors = (crew.data ?? []).filter((c) => c.role !== "driver" && (c.is_active || c.id === v?.conductor_id));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      label: formText(f, "label"),
      registration_no: formText(f, "registration_no"),
      kind: formText(f, "kind"),
      capacity: formNum(f, "capacity"),
      make_model: formText(f, "make_model"),
      driver_id: formNum(f, "driver_id"),
      conductor_id: formNum(f, "conductor_id"),
      insurance_expiry: formText(f, "insurance_expiry"),
      fitness_expiry: formText(f, "fitness_expiry"),
      permit_expiry: formText(f, "permit_expiry"),
      pollution_expiry: formText(f, "pollution_expiry"),
    };
    setSaving(true);
    setError(null);
    try {
      if (id) {
        await api.patch(`${VEHICLES}/${id}`, { ...body, is_active: f.get("status") === "active" });
        notify("Vehicle updated.");
        router.push(`${routeOf(188)}?id=${id}`);
      } else {
        const created = await api.post<Vehicle>(VEHICLES, body);
        notify("Vehicle added.");
        router.push(`${routeOf(188)}?id=${created.id}`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="two-col">
      <form id="vehicle-form" className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? existing.error ?? crew.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Details</h3>
              </div>
              <div className="form-grid">
                <Field label="Vehicle name">
                  <input name="label" defaultValue={v?.label ?? ""} placeholder="e.g. North route bus" maxLength={100} />
                </Field>
                <Field label="Registration" required>
                  <input name="registration_no" required defaultValue={v?.registration_no ?? ""} placeholder="e.g. KA-01-AB-1234" />
                </Field>
                <Field label="Vehicle type" required>
                  <select name="kind" required defaultValue={v?.kind ?? "bus"}>
                    {Object.entries(KIND_LABEL).map(([k, t]) => (
                      <option key={k} value={k}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Capacity" required>
                  <input name="capacity" type="number" min={1} required defaultValue={v?.capacity ?? ""} placeholder="Seats" />
                </Field>
                <Field label="Driver">
                  <select name="driver_id" defaultValue={v?.driver_id ?? ""}>
                    <option value="">{crew.loading ? "Loading crew…" : "No driver assigned"}</option>
                    {drivers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Conductor / attendant">
                  <select name="conductor_id" defaultValue={v?.conductor_id ?? ""}>
                    <option value="">None</option>
                    {conductors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {`${c.full_name} · ${label(c.role)}`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Make & model">
                  <input name="make_model" defaultValue={v?.make_model ?? ""} placeholder="e.g. Tata Starbus" />
                </Field>
                <Field label="Insurance expiry">
                  <input type="date" name="insurance_expiry" defaultValue={v?.insurance_expiry ?? ""} />
                </Field>
                <Field label="Fitness expiry">
                  <input type="date" name="fitness_expiry" defaultValue={v?.fitness_expiry ?? ""} />
                </Field>
                <Field label="Permit expiry">
                  <input type="date" name="permit_expiry" defaultValue={v?.permit_expiry ?? ""} />
                </Field>
                <Field label="Pollution certificate expiry">
                  <input type="date" name="pollution_expiry" defaultValue={v?.pollution_expiry ?? ""} />
                </Field>
                {id ? (
                  <Field label="Status">
                    <select name="status" defaultValue={v?.is_active === false ? "inactive" : "active"}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </Field>
                ) : null}
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="button" className="btn" onClick={() => router.back()}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save vehicle"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>Transport</h3>
          <Kv
            rows={[
              ["Mode", id ? "Editing a vehicle" : "New vehicle"],
              ["Students assigned", v ? String(v.assigned_students) : "—"],
              ["GPS tracker", v ? (v.gps_enabled ? "Key issued" : "Not set up") : "Set up after saving"],
              ["Status", v ? statusOf(v) : "Active once saved"],
            ]}
          />
          <div className="gap" />
          <p>Document expiries are flagged on the fleet list once they are within the renewal window.</p>
        </div>
      </aside>
    </div>
  );
}

/** SCR-188, live: GET /transport/vehicles/{id}, its logs, its route and its driver's licence; DELETE /transport/vehicles/{id}. */
export function VehicleDetails() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const vehicle = useApi<Vehicle>(id ? `${VEHICLES}/${id}` : null);
  const logs = useApi<VehicleLog[]>(id ? `${VEHICLES}/${id}/logs` : null);
  const routes = useApi<Route[]>(id ? ROUTES : null);
  const crew = useApi<Crew[]>(id ? CREW : null);
  const [gpsKey, setGpsKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!id) return <PickFirst what="vehicle" href={routeOf(186)} cta="Open the fleet" />;
  if (vehicle.loading && !vehicle.data) return <Loading what="Loading the vehicle…" />;
  const v = vehicle.data;
  if (!v) return <ErrorNote>{vehicle.error ?? "Vehicle not found."}</ErrorNote>;

  const route = routeFor(routes.data, v.id);
  const driver = crew.data?.find((c) => c.id === v.driver_id);
  const first = route?.stops[0];
  const services = (logs.data ?? []).filter((l) => l.kind !== "fuel");

  // The API refuses while an active route uses the vehicle and says which one.
  async function remove() {
    const name = vehicleName(v!);
    if (!(await ask(`Delete ${name} (${v!.registration_no}) for good? Its fuel, service and GPS history goes with it. To keep the history, edit it and set it Inactive instead.`))) return;
    try {
      await api.delete(`${VEHICLES}/${v!.id}`);
      notify(`${name} deleted.`);
      router.push(routeOf(186));
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function makeKey() {
    if (v!.gps_enabled && !(await ask("Generate a new key? The tracker using the old key will stop reporting."))) return;
    try {
      const r = await api.post<{ gps_api_key: string }>(`${VEHICLES}/${v!.id}/gps-key`);
      setGpsKey(r.gps_api_key);
      vehicle.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <ErrorNote>{error}</ErrorNote>
      <section className="panel profile-banner">
        <div className="profile-hero">
          <div className="row">
            <span className="avatar large">
              <Icon name="bus" />
            </span>
            <div>
              <h2>{vehicleName(v)}</h2>
              <p>{`${KIND_LABEL[v.kind]} · ${v.capacity} seats${route ? ` · ${route.name}` : ""}`}</p>
            </div>
          </div>
          <div className="row">
            <Badge>{statusOf(v)}</Badge>
            <button type="button" className="btn" onClick={remove}>
              Delete vehicle
            </button>
          </div>
        </div>
      </section>
      <div className="two-col">
        <div className="stack">
          <Panel title="Vehicle information">
            <Kv
              rows={[
                ["Registration", v.registration_no],
                ["Vehicle type", KIND_LABEL[v.kind]],
                ["Make & model", v.make_model ?? "—"],
                ["Capacity", `${v.capacity} (${v.assigned_students} assigned)`],
                ["Driver", v.driver_name ?? "—"],
                ["Conductor", v.conductor_name ?? "—"],
                ["Assigned route", route ? `${route.code} · ${route.name}` : "—"],
                ["Insurance expiry", date(v.insurance_expiry)],
              ]}
            />
          </Panel>
          <Panel title="Service history" sub="Service, repair, tyre and other entries · fuel is under Maintenance & fuel" flush>
            <DataTable
              columns={["Service", "Date", "Odometer", "Amount"]}
              rows={services.map((l) => [label(l.kind) + (l.vendor ? ` · ${l.vendor}` : ""), date(l.log_date), l.odometer_km !== null ? `${l.odometer_km.toLocaleString("en-IN")} km` : "—", money(l.amount)])}
              selectable={false}
              rowAction={false}
              empty={logs.loading ? "Loading…" : "No service entries recorded."}
            />
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Assigned driver">
            {v.driver_name ? (
              <div className="person">
                <span className="avatar mint">{initials(v.driver_name)}</span>
                <div>
                  {v.driver_name}
                  <small>{v.driver_phone ?? "No phone recorded"}</small>
                </div>
              </div>
            ) : (
              <p className="muted">No driver assigned.</p>
            )}
            <div className="gap" />
            <Kv
              rows={[
                ["Route", route ? `${route.code} · ${route.name}` : "—"],
                ["Pickup time", time12(first?.pickup_time)],
                ["Drop time", time12(first?.drop_time)],
              ]}
            />
          </Panel>
          <Panel title="Compliance dates">
            <Kv
              rows={[
                ["Insurance expiry", date(v.insurance_expiry)],
                ["Fitness expiry", date(v.fitness_expiry)],
                ["Permit expiry", date(v.permit_expiry)],
                ["Pollution expiry", date(v.pollution_expiry)],
                ["License expiry", date(driver?.license_expiry)],
              ]}
            />
            {v.expiring_documents.length ? <p className="muted">{`To renew: ${v.expiring_documents.map(label).join(", ")}`}</p> : null}
          </Panel>
          <Panel title="GPS tracker" action={<button type="button" className="btn" onClick={makeKey}>{v.gps_enabled ? "New key" : "Generate key"}</button>}>
            <p className="muted">
              {v.gps_enabled
                ? v.last_location_at
                  ? `Last position reported ${date(v.last_location_at)}.`
                  : "Key issued; no position reported yet."
                : "No tracker key issued for this vehicle."}
            </p>
            {gpsKey ? (
              <>
                <div className="gap" />
                <p>Copy this key into the tracker now. It is shown only once.</p>
                <code className="mono" style={{ wordBreak: "break-all" }}>
                  {gpsKey}
                </code>
              </>
            ) : null}
          </Panel>
        </aside>
      </div>
    </>
  );
}

/** Page-head link that keeps ?id= (e.g. "Edit vehicle"). */
export function WithIdLink({ screen, fallback, icon, children }: { screen: number; fallback: number; icon: "arrow" | "plus" | "check"; children: string }) {
  const id = useSearchParams().get("id");
  return (
    <Link href={id ? `${routeOf(screen)}?id=${id}` : routeOf(fallback)} className="btn primary">
      <Icon name={icon} className="sm" />
      {children}
    </Link>
  );
}

const LOG_KINDS: LogKind[] = ["fuel", "service", "repair", "tyre", "insurance", "other"];

/** SCR-197, live: GET/POST/DELETE /transport/vehicles/{id}/logs across the fleet. */
export function MaintenanceFuel() {
  const params = useSearchParams();
  const router = useRouter();
  const vehicles = useApi<Vehicle[]>(VEHICLES);
  const [vehicleId, setVehicleId] = useState("");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState<(VehicleLog & { vehicle: string })[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<(VehicleLog & { vehicle: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const adding = params.get("new") === "1";
  const close = () => router.replace(routeOf(197));

  const list = vehicles.data;
  // The API keeps logs per vehicle; gather them for the fleet (or the one chosen).
  useEffect(() => {
    if (!list) return;
    let live = true;
    const targets = vehicleId ? list.filter((v) => String(v.id) === vehicleId) : list;
    Promise.all(targets.map((v) => api.get<VehicleLog[]>(`${VEHICLES}/${v.id}/logs`).then((ls) => ls.map((l) => ({ ...l, vehicle: v.registration_no })))))
      .then((all) => {
        if (!live) return;
        setLogs(all.flat().sort((a, b) => b.log_date.localeCompare(a.log_date)));
        setLoadError(null);
      })
      .catch((e) => live && setLoadError(errorText(e)));
    return () => {
      live = false;
    };
  }, [list, vehicleId, tick]);

  const items = (logs ?? []).filter((l) => {
    const q = search.trim().toLowerCase();
    return (!kind || l.kind === kind) && (!q || [l.vehicle, l.vendor, l.notes].some((x) => x?.toLowerCase().includes(q)));
  });
  const rows: Row[] = items.map((l) => [
    l.vehicle,
    label(l.kind),
    l.odometer_km !== null ? `${l.odometer_km.toLocaleString("en-IN")} km` : "—",
    date(l.log_date),
    l.litres ? `${Number(l.litres)} L` : "—",
    money(l.amount),
  ]);
  const fuelSpend = items.filter((l) => l.kind === "fuel").reduce((s, l) => s + Number(l.amount ?? 0), 0);
  const otherSpend = items.filter((l) => l.kind !== "fuel").reduce((s, l) => s + Number(l.amount ?? 0), 0);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const vid = formText(f, "vehicle_id");
    setSaving(true);
    setError(null);
    try {
      await api.post(`${VEHICLES}/${vid}/logs`, {
        kind: formText(f, "kind"),
        log_date: formText(f, "log_date"),
        odometer_km: formNum(f, "odometer_km"),
        amount: formText(f, "amount"),
        litres: formText(f, "litres"),
        vendor: formText(f, "vendor"),
        notes: formText(f, "notes"),
      });
      notify("Entry recorded.");
      close();
      setTick((t) => t + 1);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(l: VehicleLog) {
    if (!(await ask("Delete this entry?"))) return;
    try {
      await api.delete(`${VEHICLES}/${l.vehicle_id}/logs/${l.id}`);
      notify("Entry deleted.");
      setViewing(null);
      setTick((t) => t + 1);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <div className="filterbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search vehicle maintenance & fuel…" />
        <select aria-label="Filter by vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">All vehicles</option>
          {list?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.registration_no}
            </option>
          ))}
        </select>
        <select aria-label="Filter by entry type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All entry types</option>
          {LOG_KINDS.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{vehicles.error ?? loadError ?? (!adding ? error : null)}</ErrorNote>
      <Panel title="Records" sub={logs ? `${items.length} entr(ies) · fuel ${money(fuelSpend)} · maintenance ${money(otherSpend)}` : "Loading…"} flush>
        <DataTable
          columns={["Vehicle", "Service type", "Odometer", "Date", "Litres", "Amount"]}
          rows={rows}
          onView={(i) => setViewing(items[i])}
          empty={logs ? "No fuel or service entries recorded." : "Loading…"}
        />
      </Panel>
      {viewing ? (
        <Modal title={`${label(viewing.kind)} · ${viewing.vehicle}`} onClose={() => setViewing(null)}>
          <Kv
            rows={[
              ["Date", date(viewing.log_date)],
              ["Odometer", viewing.odometer_km !== null ? `${viewing.odometer_km.toLocaleString("en-IN")} km` : "—"],
              ["Litres", viewing.litres ? `${Number(viewing.litres)} L` : "—"],
              ["Amount", money(viewing.amount)],
              ["Vendor", viewing.vendor ?? "—"],
              ["Notes", viewing.notes ?? "—"],
            ]}
          />
          <div className="actions row">
            <button type="button" className="btn" onClick={() => remove(viewing)}>
              Delete entry
            </button>
            <button type="button" className="btn primary" onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
        </Modal>
      ) : null}
      {adding ? (
        <Modal title="Record fuel or service" onClose={close}>
          <form onSubmit={add}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <Field label="Vehicle" required>
                <select name="vehicle_id" required defaultValue={vehicleId}>
                  <option value="">Select vehicle</option>
                  {list?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registration_no}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Entry type" required>
                <select name="kind" required defaultValue="service">
                  {LOG_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {label(k)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date" required>
                <input type="date" name="log_date" required defaultValue={today()} />
              </Field>
              <Field label="Odometer (km)">
                <input type="number" min={0} name="odometer_km" />
              </Field>
              <Field label="Amount (₹)">
                <input type="number" min={0} step="0.01" name="amount" />
              </Field>
              <Field label="Litres (fuel)">
                <input type="number" min={0} step="0.01" name="litres" />
              </Field>
              <Field label="Vendor">
                <input name="vendor" />
              </Field>
              <Field label="Notes">
                <input name="notes" />
              </Field>
            </div>
            <ModalActions onClose={close} saving={saving} label="Save entry" />
          </form>
        </Modal>
      ) : null}
    </>
  );
}
