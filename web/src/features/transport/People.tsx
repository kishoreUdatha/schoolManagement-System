"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, Kv, Modal, ModalActions, SearchBox, StudentPicker, formText, time12, today, useDebounced, type PickedStudent } from "./kit";
import type { Assignment, Crew, Direction, Route, Vehicle } from "./types";

const CREW = "/api/v1/school/transport/crew";
const ASSIGN = "/api/v1/school/transport/assignments";

/** A `?new=1` in the URL opens the page's "add" dialog (the page-head button links to it). */
function useAddDialog(screen: number) {
  const router = useRouter();
  const open = useSearchParams().get("new") === "1";
  return { open, close: () => router.replace(routeOf(screen)) };
}

/** SCR-192, live: GET/POST/PATCH/DELETE /transport/crew, with the vehicle each person is on. */
export function CrewList() {
  const crew = useApi<Crew[]>(CREW);
  const vehicles = useApi<Vehicle[]>("/api/v1/school/transport/vehicles");
  const add = useAddDialog(192);
  const [editing, setEditing] = useState<Crew | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vehicleOf = (c: Crew) => vehicles.data?.filter((v) => v.driver_id === c.id || v.conductor_id === c.id).map((v) => v.registration_no).join(", ") || "—";
  const all = crew.data ?? [];
  const items = all.filter((c) => {
    const q = search.trim().toLowerCase();
    return (!q || [c.full_name, c.phone, c.license_no].some((x) => x?.toLowerCase().includes(q))) && (!role || c.role === role) && (!status || (status === "active") === c.is_active);
  });
  const soon = (d: string | null) => d !== null && d <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const rows: Row[] = items.map((c) => [
    { name: c.full_name, sub: c.is_active ? undefined : "Inactive" },
    label(c.role),
    c.license_no ?? "—",
    c.license_expiry ? `${date(c.license_expiry)}${soon(c.license_expiry) ? " · renew" : ""}` : "—",
    c.phone,
    vehicleOf(c),
  ]);

  const dialogOpen = add.open || editing !== null;
  const close = () => {
    setError(null);
    if (editing) setEditing(null);
    else add.close();
  };

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      full_name: formText(f, "full_name"),
      role: formText(f, "role"),
      phone: formText(f, "phone"),
      license_no: formText(f, "license_no"),
      license_expiry: formText(f, "license_expiry"),
      address: formText(f, "address"),
    };
    setSaving(true);
    setError(null);
    try {
      if (editing) await api.patch(`${CREW}/${editing.id}`, { ...body, is_active: f.get("status") === "active" });
      else await api.post(CREW, body);
      notify(editing ? "Crew member updated." : "Crew member added.");
      close();
      crew.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Crew) {
    if (!window.confirm(`Remove ${c.full_name}? Vehicles they are on will be left without them.`)) return;
    try {
      await api.delete(`${CREW}/${c.id}`);
      notify("Crew member removed.");
      setEditing(null);
      crew.reload();
      vehicles.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const c = editing;
  return (
    <>
      <div className="filterbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search drivers & conductors…" />
        <select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          <option value="driver">Driver</option>
          <option value="conductor">Conductor</option>
          <option value="attendant">Attendant</option>
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{crew.error ?? vehicles.error ?? (!dialogOpen ? error : null)}</ErrorNote>
      <Panel title="Transport crew" sub={crew.data ? `${all.filter((x) => x.role === "driver").length} driver(s) · ${all.filter((x) => x.role !== "driver").length} conductor(s) / attendant(s)` : "Loading…"} flush>
        <DataTable
          columns={["Name", "Role", "License no.", "License expiry", "Phone", "Vehicle"]}
          rows={rows}
          onView={(i) => setEditing(items[i])}
          empty={crew.loading ? "Loading crew…" : all.length ? "No one matches these filters." : "No drivers or conductors yet."}
        />
      </Panel>
      {dialogOpen ? (
        <Modal title={c ? `Edit ${c.full_name}` : "Add crew member"} onClose={close}>
          <form onSubmit={save}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <Field label="Full name" required>
                <input name="full_name" required defaultValue={c?.full_name ?? ""} />
              </Field>
              <Field label="Role" required>
                <select name="role" defaultValue={c?.role ?? "driver"}>
                  <option value="driver">Driver</option>
                  <option value="conductor">Conductor</option>
                  <option value="attendant">Attendant</option>
                </select>
              </Field>
              <Field label="Phone" required>
                <input name="phone" type="tel" required defaultValue={c?.phone ?? ""} />
              </Field>
              <Field label="License no.">
                <input name="license_no" defaultValue={c?.license_no ?? ""} />
              </Field>
              <Field label="License expiry">
                <input name="license_expiry" type="date" defaultValue={c?.license_expiry ?? ""} />
              </Field>
              {c ? (
                <Field label="Status">
                  <select name="status" defaultValue={c.is_active ? "active" : "inactive"}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
              ) : null}
              <Field label="Address" full>
                <input name="address" defaultValue={c?.address ?? ""} />
              </Field>
            </div>
            {c ? (
              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn" onClick={() => remove(c)}>
                  Remove crew member
                </button>
              </div>
            ) : null}
            <ModalActions onClose={close} saving={saving} label={c ? "Save changes" : "Add crew member"} />
          </form>
        </Modal>
      ) : null}
    </>
  );
}

const DIRECTION: Record<Direction, string> = { both: "Both ways", pickup: "Pickup only", drop: "Drop only" };

/** SCR-193, live: GET/POST /transport/assignments, PATCH to move a stop, POST …/end to stop riding. */
export function RouteAssignment() {
  const routes = useApi<Route[]>("/api/v1/school/transport/routes");
  const add = useAddDialog(193);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [routeId, setRouteId] = useState("");
  const [ended, setEnded] = useState(false);
  const list = useApi<Assignment[]>(ASSIGN, { route_id: routeId, search: q, include_ended: ended || undefined });
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [pickRoute, setPickRoute] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = list.data ?? [];
  const stopOf = (a: Assignment, leg: "pickup" | "drop") => (a.direction === "both" || a.direction === leg ? `${a.stop_name} · ${time12(leg === "pickup" ? a.pickup_time : a.drop_time)}` : "—");
  const rows: Row[] = items.map((a) => [
    { name: a.student_name, sub: a.admission_no },
    a.section_label ?? "—",
    stopOf(a, "pickup"),
    stopOf(a, "drop"),
    a.route_name,
    a.end_date ? `Ended ${date(a.end_date)}` : `${money(a.monthly_fee)} / month`,
  ]);

  const dialogOpen = add.open || editing !== null;
  const close = () => {
    setError(null);
    setStudent(null);
    setPickRoute("");
    if (editing) setEditing(null);
    else add.close();
  };
  const routeStops = (id: string | number) => routes.data?.find((r) => String(r.id) === String(id))?.stops ?? [];

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.patch(`${ASSIGN}/${editing.id}`, { stop_id: Number(f.get("stop_id")), direction: formText(f, "direction"), start_date: formText(f, "start_date") });
        notify("Assignment updated.");
      } else {
        if (!student) throw new Error("Choose a student.");
        await api.post(ASSIGN, {
          student_id: student.id,
          route_id: Number(f.get("route_id")),
          stop_id: Number(f.get("stop_id")),
          direction: formText(f, "direction"),
          start_date: formText(f, "start_date"),
        });
        notify(`${student.full_name} assigned.`);
      }
      close();
      list.reload();
      routes.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function end(a: Assignment) {
    if (!window.confirm(`Stop transport for ${a.student_name} from today?`)) return;
    try {
      await api.post(`${ASSIGN}/${a.id}/end`, { end_date: today() });
      notify("Transport ended.");
      close();
      list.reload();
      routes.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const a = editing;
  return (
    <>
      <div className="filterbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search student route assignment…" />
        <select aria-label="Filter by route" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
          <option value="">All routes</option>
          {routes.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {`${r.code} · ${r.name}`}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={ended ? "all" : "current"} onChange={(e) => setEnded(e.target.value === "all")}>
          <option value="current">Riding now</option>
          <option value="all">Including ended</option>
        </select>
      </div>
      <ErrorNote>{list.error ?? routes.error ?? (!dialogOpen ? error : null)}</ErrorNote>
      <Panel title="Allocation workspace" sub={list.data ? `${items.filter((x) => !x.end_date).length} student(s) riding` : "Loading…"} flush>
        <DataTable
          columns={["Student", "Class", "Pickup stop", "Drop stop", "Route", "Fee plan"]}
          rows={rows}
          onView={(i) => setEditing(items[i])}
          empty={list.loading ? "Loading assignments…" : "No students are assigned to transport."}
        />
      </Panel>
      {dialogOpen ? (
        <Modal title={a ? a.student_name : "Assign route"} onClose={close}>
          <form onSubmit={save}>
            <ErrorNote>{error}</ErrorNote>
            {a ? (
              <Kv
                rows={[
                  ["Route", a.route_name],
                  ["Class", a.section_label ?? "—"],
                  ["Since", date(a.start_date)],
                  ["Fee", `${money(a.monthly_fee)} / month`],
                ]}
              />
            ) : null}
            <div className="form-grid">
              {a ? null : (
                <>
                  <StudentPicker value={student} onChange={setStudent} required />
                  <Field label="Route" required>
                    <select name="route_id" required value={pickRoute} onChange={(e) => setPickRoute(e.target.value)}>
                      <option value="">Select route</option>
                      {routes.data
                        ?.filter((r) => r.is_active)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {`${r.code} · ${r.name} (${r.student_count}${r.vehicle_capacity ? `/${r.vehicle_capacity}` : ""})`}
                          </option>
                        ))}
                    </select>
                  </Field>
                </>
              )}
              <Field label="Stop" required>
                <select name="stop_id" required defaultValue={a?.stop_id ?? ""} disabled={!a && !pickRoute}>
                  <option value="">Select stop</option>
                  {routeStops(a ? a.route_id : pickRoute).map((s) => (
                    <option key={s.id} value={s.id}>
                      {`${s.sequence}. ${s.name} · ${time12(s.pickup_time)}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Uses">
                <select name="direction" defaultValue={a?.direction ?? "both"}>
                  {Object.entries(DIRECTION).map(([k, t]) => (
                    <option key={k} value={k}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Start date">
                <input type="date" name="start_date" defaultValue={a?.start_date ?? today()} />
              </Field>
            </div>
            {a && !a.end_date ? (
              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn" onClick={() => end(a)}>
                  End transport
                </button>
              </div>
            ) : null}
            {a?.end_date ? (
              <div className="actions row">
                <button type="button" className="btn primary" onClick={close}>
                  Close
                </button>
              </div>
            ) : (
              <ModalActions onClose={close} saving={saving} label={a ? "Save changes" : "Assign route"} />
            )}
          </form>
        </Modal>
      ) : null}
    </>
  );
}
