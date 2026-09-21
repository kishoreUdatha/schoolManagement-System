"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, inr, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

import { Route, TransportTabs, Vehicle, hhmm } from "../TransportTabs";

export default function RoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Route | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const { data } = await api.get<Route[]>("/api/v1/school/transport/routes");
      setRoutes(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(r: Route) {
    try {
      await api.patch(`/api/v1/school/transport/routes/${r.id}`, { is_active: !r.is_active });
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function remove(r: Route) {
    if (!window.confirm(`Delete route ${r.name}?`)) return;
    try {
      await api.delete(`/api/v1/school/transport/routes/${r.id}`);
      setNotice(`Deleted ${r.name}.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transport"
        subtitle="Routes with ordered stops, timings and fees."
        actions={<Button onClick={() => setCreating(true)}>+ New route</Button>}
      />
      <TransportTabs />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {routes.length === 0 && (
        <Card className="p-8 text-center text-sm text-ink-muted">No routes yet.</Card>
      )}
      {routes.map((r) => {
        const over = r.vehicle_capacity != null && r.student_count > r.vehicle_capacity;
        return (
          <Card key={r.id}>
            <CardHeader>
              <div>
                <CardTitle>
                  {r.code} · {r.name} {!r.is_active && <Badge>inactive</Badge>}
                </CardTitle>
                <div className="mt-1 text-xs text-ink-muted">
                  {r.vehicle_label ?? "No vehicle"} ·{" "}
                  <span className={over ? "font-semibold text-danger" : ""}>
                    {r.student_count}
                    {r.vehicle_capacity != null && ` / ${r.vehicle_capacity}`} students
                  </span>{" "}
                  · default fee {inr(r.monthly_fee)}/month
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(r)}>
                  {r.is_active ? "Deactivate" : "Activate"}
                </Button>
                <Button size="sm" variant="danger" onClick={() => remove(r)}>
                  Delete
                </Button>
              </div>
            </CardHeader>
            <Table head={["#", "Stop", "Pickup", "Drop", "Fee / month", "Students"]} empty={r.stops.length === 0 && "No stops."}>
              {r.stops.map((s) => (
                <tr key={s.id}>
                  <td className={td}>{s.sequence}</td>
                  <td className={tdStrong}>{s.name}</td>
                  <td className={td}>{hhmm(s.pickup_time)}</td>
                  <td className={td}>{hhmm(s.drop_time)}</td>
                  <td className={td}>
                    {inr(s.effective_fee)}
                    {s.monthly_fee == null && <span className="text-ink-subtle"> (route)</span>}
                  </td>
                  <td className={td}>{s.student_count}</td>
                </tr>
              ))}
            </Table>
          </Card>
        );
      })}

      {(creating || editing) && (
        <RouteModal
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(msg) => {
            setCreating(false);
            setEditing(null);
            setNotice(msg);
            load();
          }}
        />
      )}
    </div>
  );
}

type StopForm = {
  id?: number;
  name: string;
  pickup_time: string;
  drop_time: string;
  monthly_fee: string;
  lat: string;
  lng: string;
};

function RouteModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: Route | null;
  onClose: () => void;
  onSaved: (m: string) => void;
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    code: existing?.code ?? "",
    vehicle_id: existing?.vehicle_id ? String(existing.vehicle_id) : "",
    monthly_fee: existing?.monthly_fee ?? "0",
  });
  const [stops, setStops] = useState<StopForm[]>(
    existing?.stops.map((s) => ({
      id: s.id,
      name: s.name,
      pickup_time: s.pickup_time?.slice(0, 5) ?? "",
      drop_time: s.drop_time?.slice(0, 5) ?? "",
      monthly_fee: s.monthly_fee ?? "",
      lat: s.lat?.toString() ?? "",
      lng: s.lng?.toString() ?? "",
    })) ?? [{ name: "", pickup_time: "", drop_time: "", monthly_fee: "", lat: "", lng: "" }]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Vehicle[]>("/api/v1/school/transport/vehicles")
      .then((r) => setVehicles(r.data.filter((v) => v.is_active)))
      .catch(() => undefined);
  }, []);

  function setStop(i: number, patch: Partial<StopForm>) {
    setStops(stops.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= stops.length) return;
    const next = [...stops];
    [next[i], next[j]] = [next[j], next[i]];
    setStops(next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name,
      code: form.code,
      vehicle_id: form.vehicle_id ? Number(form.vehicle_id) : null,
      monthly_fee: form.monthly_fee || "0",
      stops: stops
        .filter((s) => s.name.trim())
        .map((s) => ({
          id: s.id,
          name: s.name,
          pickup_time: s.pickup_time || null,
          drop_time: s.drop_time || null,
          monthly_fee: s.monthly_fee === "" ? null : s.monthly_fee,
          lat: s.lat === "" ? null : Number(s.lat),
          lng: s.lng === "" ? null : Number(s.lng),
        })),
    };
    try {
      if (existing) {
        await api.patch(`/api/v1/school/transport/routes/${existing.id}`, payload);
        onSaved("Route updated.");
      } else {
        await api.post("/api/v1/school/transport/routes", payload);
        onSaved("Route created.");
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={existing ? `Edit ${existing.name}` : "New route"} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <Input label="Code *" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          <div className="sm:col-span-3">
            <Input label="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="sm:col-span-2">
            <Select label="Vehicle" value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}>
              <option value="">None</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label ?? v.registration_no} ({v.capacity} seats)
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Input
              label="Default fee / month (₹)"
              type="number"
              min="0"
              step="0.01"
              value={form.monthly_fee}
              onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })}
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Stops (in pickup order)</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                setStops([...stops, { name: "", pickup_time: "", drop_time: "", monthly_fee: "", lat: "", lng: "" }])
              }
            >
              + Add stop
            </Button>
          </CardHeader>
          <CardBody className="space-y-3">
            {stops.map((s, i) => (
              <div key={s.id ?? `new-${i}`} className="grid items-end gap-2 sm:grid-cols-12">
                <div className="flex gap-1 sm:col-span-1">
                  <button type="button" className="text-ink-subtle hover:text-ink" onClick={() => move(i, -1)} aria-label="Move up">
                    ↑
                  </button>
                  <button type="button" className="text-ink-subtle hover:text-ink" onClick={() => move(i, 1)} aria-label="Move down">
                    ↓
                  </button>
                </div>
                <div className="sm:col-span-3">
                  <Input label={i === 0 ? "Stop" : undefined} value={s.name} onChange={(e) => setStop(i, { name: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Input label={i === 0 ? "Pickup" : undefined} type="time" value={s.pickup_time} onChange={(e) => setStop(i, { pickup_time: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Input label={i === 0 ? "Drop" : undefined} type="time" value={s.drop_time} onChange={(e) => setStop(i, { drop_time: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    label={i === 0 ? "Fee (blank = route)" : undefined}
                    type="number"
                    min="0"
                    value={s.monthly_fee}
                    onChange={(e) => setStop(i, { monthly_fee: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setStops(stops.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>

        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {existing ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
