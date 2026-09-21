"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  Textarea,
  humanize,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

import { Crew, TransportTabs, Vehicle, mapsLink } from "../TransportTabs";

type VehicleLog = {
  id: number;
  kind: string;
  log_date: string;
  odometer_km: number | null;
  amount: string | null;
  litres: string | null;
  vendor: string | null;
  notes: string | null;
};

export default function VehiclesPage() {
  const [items, setItems] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [creating, setCreating] = useState(false);
  const [logsFor, setLogsFor] = useState<Vehicle | null>(null);
  const [gpsKey, setGpsKey] = useState<{ vehicle: Vehicle; key: string } | null>(null);

  async function load() {
    try {
      const { data } = await api.get<Vehicle[]>("/api/v1/school/transport/vehicles");
      setItems(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function makeKey(v: Vehicle) {
    if (v.gps_enabled && !window.confirm("Generate a new key? The tracker using the old key will stop reporting.")) return;
    try {
      const { data } = await api.post<{ gps_api_key: string }>(`/api/v1/school/transport/vehicles/${v.id}/gps-key`);
      setGpsKey({ vehicle: v, key: data.gps_api_key });
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function remove(v: Vehicle) {
    if (!window.confirm(`Delete ${v.registration_no}?`)) return;
    try {
      await api.delete(`/api/v1/school/transport/vehicles/${v.id}`);
      setNotice(`Deleted ${v.registration_no}.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transport"
        subtitle="Fleet, compliance documents, GPS and running costs."
        actions={<Button onClick={() => setCreating(true)}>+ New vehicle</Button>}
      />
      <TransportTabs />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      <Card>
        <Table
          head={["Vehicle", "Type", "Seats", "Driver", "Documents", "Last seen", ""]}
          empty={items.length === 0 && "No vehicles yet."}
        >
          {items.map((v) => (
            <tr key={v.id} className="hover:bg-surface-hover">
              <td className={tdStrong}>
                {v.label ?? v.registration_no} {!v.is_active && <Badge>inactive</Badge>}
                <div className="text-xs font-normal text-ink-subtle">
                  {v.registration_no}
                  {v.make_model && ` · ${v.make_model}`}
                </div>
              </td>
              <td className={td}>{humanize(v.kind)}</td>
              <td className={td}>
                {v.assigned_students}/{v.capacity}
              </td>
              <td className={td}>
                {v.driver_name ?? "—"}
                {v.driver_phone && <div className="text-xs text-ink-subtle">{v.driver_phone}</div>}
              </td>
              <td className="px-4 py-3 text-xs">
                {v.expiring_documents.length ? (
                  v.expiring_documents.map((d) => (
                    <div key={d} className={d.includes("expired") ? "text-danger" : "text-warning"}>
                      {d}
                    </div>
                  ))
                ) : (
                  <span className="text-success">OK</span>
                )}
              </td>
              <td className={td}>
                {v.last_lat != null && v.last_lng != null && v.last_location_at ? (
                  <a className="hover:underline" href={mapsLink(v.last_lat, v.last_lng)} target="_blank" rel="noreferrer">
                    {new Date(v.last_location_at).toLocaleString()}
                    {v.last_speed_kmph != null && ` · ${Math.round(v.last_speed_kmph)} km/h`}
                  </a>
                ) : v.gps_enabled ? (
                  "Waiting for tracker"
                ) : (
                  "GPS off"
                )}
              </td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                <Button size="sm" variant="secondary" onClick={() => setEditing(v)}>
                  Edit
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setLogsFor(v)}>
                  Fuel & service
                </Button>
                <Button size="sm" variant="ghost" onClick={() => makeKey(v)}>
                  {v.gps_enabled ? "New GPS key" : "Enable GPS"}
                </Button>
                <Button size="sm" variant="danger" onClick={() => remove(v)}>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      {(creating || editing) && (
        <VehicleModal
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(m) => {
            setCreating(false);
            setEditing(null);
            setNotice(m);
            load();
          }}
        />
      )}
      {logsFor && <LogsModal vehicle={logsFor} onClose={() => setLogsFor(null)} />}
      {gpsKey && (
        <Modal open onClose={() => setGpsKey(null)} title={`GPS key for ${gpsKey.vehicle.registration_no}`}>
          <div className="space-y-3 text-sm text-ink-muted">
            <p>Configure the tracker (or driver app) to send its location every 10–30 seconds:</p>
            <pre className="overflow-x-auto rounded bg-surface-subtle p-3 text-xs text-ink">{`POST ${
              process.env.NEXT_PUBLIC_API_URL ?? ""
            }/api/v1/public/transport/gps
X-Device-Key: ${gpsKey.key}
Content-Type: application/json

{"lat": 12.9716, "lng": 77.5946, "speed_kmph": 30}`}</pre>
            <p>This key is shown once. Generating a new one disables the old key.</p>
            <div className="flex justify-end">
              <Button onClick={() => navigator.clipboard?.writeText(gpsKey.key)}>Copy key</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function VehicleModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: Vehicle | null;
  onClose: () => void;
  onSaved: (m: string) => void;
}) {
  const [crew, setCrew] = useState<Crew[]>([]);
  const [form, setForm] = useState({
    registration_no: existing?.registration_no ?? "",
    label: existing?.label ?? "",
    kind: existing?.kind ?? "bus",
    capacity: existing?.capacity?.toString() ?? "",
    make_model: existing?.make_model ?? "",
    driver_id: existing?.driver_id?.toString() ?? "",
    conductor_id: existing?.conductor_id?.toString() ?? "",
    insurance_expiry: existing?.insurance_expiry ?? "",
    fitness_expiry: existing?.fitness_expiry ?? "",
    permit_expiry: existing?.permit_expiry ?? "",
    pollution_expiry: existing?.pollution_expiry ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Crew[]>("/api/v1/school/transport/crew").then((r) => setCrew(r.data.filter((c) => c.is_active))).catch(() => undefined);
  }, []);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      ...form,
      label: form.label || null,
      make_model: form.make_model || null,
      capacity: Number(form.capacity),
      driver_id: form.driver_id ? Number(form.driver_id) : null,
      conductor_id: form.conductor_id ? Number(form.conductor_id) : null,
      insurance_expiry: form.insurance_expiry || null,
      fitness_expiry: form.fitness_expiry || null,
      permit_expiry: form.permit_expiry || null,
      pollution_expiry: form.pollution_expiry || null,
    };
    try {
      if (existing) {
        await api.patch(`/api/v1/school/transport/vehicles/${existing.id}`, payload);
        onSaved("Vehicle updated.");
      } else {
        await api.post("/api/v1/school/transport/vehicles", payload);
        onSaved("Vehicle added.");
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={existing ? `Edit ${existing.registration_no}` : "New vehicle"} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Registration no. *" value={form.registration_no} onChange={set("registration_no")} required />
          <Input label="Label" placeholder="Bus 7" value={form.label} onChange={set("label")} />
          <Select label="Type" value={form.kind} onChange={set("kind")}>
            {["bus", "mini_bus", "van", "car", "other"].map((k) => (
              <option key={k} value={k}>
                {humanize(k)}
              </option>
            ))}
          </Select>
          <Input label="Seats *" type="number" min={1} value={form.capacity} onChange={set("capacity")} required />
          <Input label="Make / model" value={form.make_model} onChange={set("make_model")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Driver" value={form.driver_id} onChange={set("driver_id")}>
            <option value="">None</option>
            {crew.filter((c) => c.role === "driver").map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </Select>
          <Select label="Conductor / attendant" value={form.conductor_id} onChange={set("conductor_id")}>
            <option value="">None</option>
            {crew.filter((c) => c.role !== "driver").map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name} ({c.role})
              </option>
            ))}
          </Select>
        </div>
        <div className="text-xs font-semibold uppercase text-ink-subtle">Document expiry</div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Input label="Insurance" type="date" value={form.insurance_expiry} onChange={set("insurance_expiry")} />
          <Input label="Fitness" type="date" value={form.fitness_expiry} onChange={set("fitness_expiry")} />
          <Input label="Permit" type="date" value={form.permit_expiry} onChange={set("permit_expiry")} />
          <Input label="Pollution (PUC)" type="date" value={form.pollution_expiry} onChange={set("pollution_expiry")} />
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {existing ? "Save" : "Add"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function LogsModal({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const [logs, setLogs] = useState<VehicleLog[]>([]);
  const [form, setForm] = useState({
    kind: "fuel",
    log_date: new Date().toISOString().slice(0, 10),
    odometer_km: "",
    amount: "",
    litres: "",
    vendor: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/school/transport/vehicles/${vehicle.id}/logs`;

  async function load() {
    try {
      const { data } = await api.get<VehicleLog[]>(base);
      setLogs(data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(base, {
        kind: form.kind,
        log_date: form.log_date,
        odometer_km: form.odometer_km ? Number(form.odometer_km) : null,
        amount: form.amount || null,
        litres: form.kind === "fuel" && form.litres ? form.litres : null,
        vendor: form.vendor || null,
        notes: form.notes || null,
      });
      setForm({ ...form, odometer_km: "", amount: "", litres: "", vendor: "", notes: "" });
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function remove(id: number) {
    try {
      await api.delete(`${base}/${id}`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  const total = logs.reduce((s, l) => s + Number(l.amount ?? 0), 0);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal open onClose={onClose} title={`Fuel & service — ${vehicle.label ?? vehicle.registration_no}`} size="lg">
      <form onSubmit={add} className="grid items-end gap-3 sm:grid-cols-6">
        <Select label="Type" value={form.kind} onChange={set("kind")}>
          {["fuel", "service", "repair", "tyre", "insurance", "other"].map((k) => (
            <option key={k} value={k}>
              {humanize(k)}
            </option>
          ))}
        </Select>
        <Input label="Date" type="date" value={form.log_date} onChange={set("log_date")} required />
        <Input label="Odometer" type="number" min={0} value={form.odometer_km} onChange={set("odometer_km")} />
        <Input label="Amount ₹" type="number" min={0} step="0.01" value={form.amount} onChange={set("amount")} />
        {form.kind === "fuel" ? (
          <Input label="Litres" type="number" min={0} step="0.01" value={form.litres} onChange={set("litres")} />
        ) : (
          <Input label="Vendor" value={form.vendor} onChange={set("vendor")} />
        )}
        <Button type="submit">Add</Button>
        <div className="sm:col-span-6">
          <Textarea placeholder="Notes" value={form.notes} onChange={set("notes")} rows={1} />
        </div>
      </form>
      <div className="mt-2">
        <ErrorBox>{error}</ErrorBox>
      </div>
      <div className="mt-4 text-sm text-ink-muted">Total recorded: {inr(total)}</div>
      <Table head={["Date", "Type", "Odometer", "Amount", "Litres", "Vendor / notes", ""]} empty={logs.length === 0 && "Nothing logged yet."}>
        {logs.map((l) => (
          <tr key={l.id}>
            <td className={td}>{l.log_date}</td>
            <td className={td}>{humanize(l.kind)}</td>
            <td className={td}>{l.odometer_km ?? "—"}</td>
            <td className={td}>{inr(l.amount)}</td>
            <td className={td}>{l.litres ?? "—"}</td>
            <td className={td}>{[l.vendor, l.notes].filter(Boolean).join(" · ") || "—"}</td>
            <td className="px-4 py-3 text-right">
              <Button size="sm" variant="ghost" onClick={() => remove(l.id)}>
                ✕
              </Button>
            </td>
          </tr>
        ))}
      </Table>
    </Modal>
  );
}
