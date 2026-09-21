"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ChevronLeft, Fuel, MapPin, Plus, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Select,
  Table,
  Textarea,
  WarnBox,
  humanize,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { daysLeft, readableDate } from "@/lib/dates";

type Vehicle = {
  id: number;
  registration_no: string;
  label: string | null;
  kind: string;
  capacity: number;
  make_model: string | null;
  driver_id: number | null;
  driver_name: string | null;
  driver_phone: string | null;
  conductor_id: number | null;
  conductor_name: string | null;
  insurance_expiry: string | null;
  fitness_expiry: string | null;
  permit_expiry: string | null;
  pollution_expiry: string | null;
  expiring_documents: string[];
  gps_enabled: boolean;
  last_lat: number | null;
  last_lng: number | null;
  last_speed_kmph: number | null;
  last_location_at: string | null;
  assigned_students: number;
  is_active: boolean;
};

type Log = {
  id: number;
  vehicle_id: number;
  kind: string;
  log_date: string;
  odometer_km: number | null;
  amount: string | null;
  litres: string | null;
  vendor: string | null;
  notes: string | null;
  created_at: string;
};

const LOG_KINDS = ["fuel", "service", "repair", "tyre", "insurance", "other"];

/** Papers a bus must carry to be on the road, in the order the office checks
 *  them. Insurance and fitness are the two that stop it legally. */
const PAPERS: { key: keyof Vehicle; label: string }[] = [
  { key: "insurance_expiry", label: "Insurance" },
  { key: "fitness_expiry", label: "Fitness" },
  { key: "permit_expiry", label: "Permit" },
  { key: "pollution_expiry", label: "Pollution" },
];

/** Days until a date, negative once it has gone by. */
function paperTone(iso: string | null): "neutral" | "emerald" | "amber" | "rose" {
  const left = daysLeft(iso);
  if (left === null) return "neutral";
  if (left < 0) return "rose";
  if (left <= 30) return "amber";
  return "emerald";
}

const blank = {
  kind: "fuel",
  log_date: new Date().toISOString().slice(0, 10),
  odometer_km: "",
  amount: "",
  litres: "",
  vendor: "",
  notes: "",
};

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [form, setForm] = useState({ ...blank });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(
    () =>
      api
        .get<Log[]>(`/api/v1/school/transport/vehicles/${id}/logs`)
        .then((r) => setLogs(r.data))
        .catch((e) => setError(apiError(e))),
    [id]
  );

  useEffect(() => {
    api
      .get<Vehicle>(`/api/v1/school/transport/vehicles/${id}`)
      .then((r) => setVehicle(r.data))
      .catch((e) => setError(apiError(e)));
    loadLogs();
  }, [id, loadLogs]);

  const addLog = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/transport/vehicles/${id}/logs`, {
        kind: form.kind,
        log_date: form.log_date,
        odometer_km: form.odometer_km === "" ? null : Number(form.odometer_km),
        amount: form.amount === "" ? null : form.amount,
        litres: form.litres === "" ? null : form.litres,
        vendor: form.vendor || null,
        notes: form.notes || null,
      });
      setAdding(false);
      setForm({ ...blank });
      loadLogs();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const removeLog = async (log: Log) => {
    if (!window.confirm(`Remove the ${log.kind} entry from ${readableDate(log.log_date)}?`)) return;
    setError(null);
    try {
      await api.delete(`/api/v1/school/transport/vehicles/${id}/logs/${log.id}`);
      loadLogs();
    } catch (err) {
      setError(apiError(err));
    }
  };

  const expired = PAPERS.filter((p) => {
    const left = daysLeft(vehicle?.[p.key] as string | null);
    return left !== null && left < 0;
  });
  const fuelLogs = logs.filter((l) => l.kind === "fuel");
  const spentOnFuel = fuelLogs.reduce((n, l) => n + Number(l.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <Link
        href="/school/transport"
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        All transport
      </Link>

      <PageHeader
        title={vehicle ? vehicle.registration_no : "Vehicle"}
        subtitle={
          vehicle
            ? [humanize(vehicle.kind), vehicle.make_model, vehicle.label]
                .filter(Boolean)
                .join(" · ")
            : "Loading…"
        }
        actions={
          vehicle && !vehicle.is_active ? <Badge tone="neutral">Off the road</Badge> : undefined
        }
      />
      <ErrorBox>{error}</ErrorBox>

      {expired.length > 0 && (
        <WarnBox>
          {expired.map((p) => p.label).join(" and ")}{" "}
          {expired.length === 1 ? "has" : "have"} expired. A bus without valid papers cannot
          legally carry children — sort this before it goes out again.
        </WarnBox>
      )}

      {/* The over-capacity warning used to be a rose tint; it is words now, so
          it survives being printed or read aloud. */}
      <StatStrip
        stats={[
          {
            label: "Seats",
            value: vehicle?.capacity ?? "—",
            note: vehicle ? humanize(vehicle.kind) : undefined,
            icon: Users,
          },
          {
            label: "Children on board",
            value: vehicle?.assigned_students ?? "—",
            note: vehicle
              ? vehicle.assigned_students > vehicle.capacity
                ? "More riders than seats"
                : `of ${vehicle.capacity} seats`
              : undefined,
            icon: Users,
          },
          {
            label: "Fuel spend logged",
            value: spentOnFuel ? inr(spentOnFuel) : "—",
            note: `${fuelLogs.length} fuel entr${fuelLogs.length === 1 ? "y" : "ies"}`,
            icon: Fuel,
          },
          {
            label: "GPS",
            value: vehicle?.gps_enabled ? "On" : "Off",
            note: vehicle?.gps_enabled ? "Position is being reported" : "No position reported",
            icon: MapPin,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Papers</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">
                Insurance and fitness are the two that stop a bus legally.
              </p>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <Table head={["Document", "Expires", "State"]}>
              {PAPERS.map((p) => {
                const value = vehicle?.[p.key] as string | null;
                const left = daysLeft(value);
                return (
                  <tr key={p.key}>
                    <td className={tdStrong}>{p.label}</td>
                    <td className={td}>{value ? readableDate(value) : "Not recorded"}</td>
                    <td className={td}>
                      {left === null ? (
                        <span className="text-ink-subtle">—</span>
                      ) : (
                        <Badge tone={paperTone(value)}>
                          {left < 0
                            ? `Expired ${Math.abs(left)} day(s) ago`
                            : left === 0
                              ? "Expires today"
                              : `${left} day(s) left`}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Crew</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">
                Who is on this vehicle, and the number to ring.
              </p>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <Table head={["Role", "Name", "Phone"]}>
              <tr>
                <td className={tdStrong}>Driver</td>
                <td className={td}>{vehicle?.driver_name ?? "Nobody assigned"}</td>
                <td className={td}>{vehicle?.driver_phone ?? "—"}</td>
              </tr>
              <tr>
                <td className={tdStrong}>Conductor</td>
                <td className={td}>{vehicle?.conductor_name ?? "Nobody assigned"}</td>
                <td className={td}>—</td>
              </tr>
            </Table>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Fuel and service log</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Every fill, service and repair entered against this vehicle.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add entry
          </Button>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Date", "Kind", "Odometer", "Litres", "Amount", "Vendor", ""]}
            empty={logs.length === 0 && "Nothing has been logged for this vehicle yet."}
          >
            {logs.map((l) => (
              <tr key={l.id}>
                <td className={tdStrong}>{readableDate(l.log_date)}</td>
                <td className={td}>{humanize(l.kind)}</td>
                <td className={td}>{l.odometer_km ? `${l.odometer_km} km` : "—"}</td>
                <td className={td}>{l.litres ?? "—"}</td>
                <td className={td}>{l.amount ? inr(l.amount) : "—"}</td>
                <td className={td}>
                  {l.vendor ?? "—"}
                  {l.notes && (
                    <span className="block text-[11px] text-ink-subtle">{l.notes}</span>
                  )}
                </td>
                <td className={td}>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`Remove ${l.kind} entry`}
                    onClick={() => removeLog(l)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`Showing ${logs.length} entr${logs.length === 1 ? "y" : "ies"}`}
          right={spentOnFuel ? `${inr(spentOnFuel)} on fuel` : undefined}
        />
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a log entry">
        <form onSubmit={addLog} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Kind"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              {LOG_KINDS.map((k) => (
                <option key={k} value={k}>
                  {humanize(k)}
                </option>
              ))}
            </Select>
            <Input
              label="Date"
              type="date"
              value={form.log_date}
              onChange={(e) => setForm({ ...form, log_date: e.target.value })}
              required
            />
            <Input
              label="Odometer (km)"
              type="number"
              min={0}
              value={form.odometer_km}
              onChange={(e) => setForm({ ...form, odometer_km: e.target.value })}
            />
            <Input
              label="Litres"
              type="number"
              min={0}
              step="0.01"
              value={form.litres}
              onChange={(e) => setForm({ ...form, litres: e.target.value })}
            />
            <Input
              label="Amount"
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <Input
              label="Vendor"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            />
          </div>
          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save entry
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
