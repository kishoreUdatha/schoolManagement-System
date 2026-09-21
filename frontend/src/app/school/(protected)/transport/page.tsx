"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  humanize,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

import { TransportTabs, Trip } from "./TransportTabs";

type Dashboard = {
  vehicles: number;
  active_routes: number;
  students_using_transport: number;
  seats_total: number;
  trips_today: number;
  trips_in_progress: number;
  expiring_documents: { vehicle: string; message: string }[];
  overloaded_routes: { route: string; students: number; capacity: number }[];
};

const statusTone = {
  scheduled: "neutral",
  in_progress: "amber",
  completed: "emerald",
  cancelled: "rose",
} as const;

export default function TransportOverviewPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState(today);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [feesOpen, setFeesOpen] = useState(false);

  async function load() {
    try {
      const [d, t] = await Promise.all([
        api.get<Dashboard>("/api/v1/school/transport/dashboard"),
        api.get<Trip[]>("/api/v1/school/transport/trips", { params: { on: day } }),
      ]);
      setDash(d.data);
      setTrips(t.data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  async function generate() {
    try {
      const { data } = await api.post<{ created: number }>(
        "/api/v1/school/transport/trips/generate",
        null,
        { params: { on: day } }
      );
      setNotice(data.created ? `Created ${data.created} trip sheet(s).` : "Trip sheets already exist for this day.");
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transport"
        subtitle="Buses, routes, students on board and monthly transport fees."
        actions={<Button variant="secondary" onClick={() => setFeesOpen(true)}>Raise monthly fees</Button>}
      />
      <TransportTabs />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {dash && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Students using transport" value={dash.students_using_transport} />
          <StatCard label="Active routes" value={dash.active_routes} />
          <StatCard label="Vehicles" value={dash.vehicles} hint={`${dash.seats_total} seats`} />
          <StatCard
            label="Trips today"
            value={dash.trips_today}
            hint={`${dash.trips_in_progress} in progress`}
            accent={dash.trips_in_progress ? "amber" : "brand"}
          />
        </div>
      )}

      {dash && (dash.expiring_documents.length > 0 || dash.overloaded_routes.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="space-y-1 text-sm">
              {dash.overloaded_routes.map((o) => (
                <li key={o.route} className="text-danger">
                  {o.route}: {o.students} students for {o.capacity} seats
                </li>
              ))}
              {dash.expiring_documents.map((d, i) => (
                <li key={i} className="text-warning">
                  {d.vehicle}: {d.message}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Trip sheets</CardTitle>
          <div className="flex items-end gap-2">
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            <Button size="sm" onClick={generate}>
              Create trip sheets
            </Button>
          </div>
        </CardHeader>
        <Table
          head={["Route", "Run", "Vehicle", "Driver", "Status", "On board", "Absent", ""]}
          empty={trips.length === 0 && "No trip sheets for this day yet. Click “Create trip sheets”."}
        >
          {trips.map((t) => (
            <tr key={t.id} className="hover:bg-surface-hover">
              <td className={tdStrong}>{t.route_name}</td>
              <td className={td}>{humanize(t.direction)}</td>
              <td className={td}>{t.vehicle_label ?? "—"}</td>
              <td className={td}>{t.driver_name ?? "—"}</td>
              <td className="px-4 py-3">
                <Badge tone={statusTone[t.status]}>{humanize(t.status)}</Badge>
              </td>
              <td className={td}>
                {t.boarded}/{t.expected}
              </td>
              <td className={td}>{t.absent || "—"}</td>
              <td className="px-4 py-3 text-right">
                <Link href={`/school/transport/trips/${t.id}`}>
                  <Button size="sm" variant="secondary">
                    Open
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      {feesOpen && (
        <FeesModal
          onClose={() => setFeesOpen(false)}
          onDone={(msg) => {
            setFeesOpen(false);
            setNotice(msg);
          }}
        />
      )}
    </div>
  );
}

function FeesModal({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [heads, setHeads] = useState<{ id: number; name: string; code: string }[]>([]);
  const [headId, setHeadId] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [dueDay, setDueDay] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ id: number; name: string; code: string; is_active: boolean }[]>("/api/v1/school/fees/heads")
      .then((r) => {
        const active = r.data.filter((h) => h.is_active);
        setHeads(active);
        const guess = active.find((h) => /transport|bus/i.test(`${h.name} ${h.code}`));
        if (guess) setHeadId(String(guess.id));
      })
      .catch((e) => setError(apiError(e)));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<{ created: number; skipped: number; total_amount: string }>(
        "/api/v1/school/transport/fees/generate",
        { fee_head_id: Number(headId), period, due_day: Number(dueDay) }
      );
      onDone(
        `Raised ${data.created} transport fee(s) for ${period} totalling ${inr(data.total_amount)}` +
          (data.skipped ? ` (${data.skipped} already billed or free).` : ".")
      );
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Raise monthly transport fees">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-muted">
          Adds one fee per student using transport in the month, at their stop’s rate (or the
          route’s default). Safe to run again — students already billed are skipped.
        </p>
        <Select label="Fee head *" value={headId} onChange={(e) => setHeadId(e.target.value)} required>
          <option value="">Select</option>
          {heads.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name} ({h.code})
            </option>
          ))}
        </Select>
        {heads.length === 0 && (
          <p className="text-xs text-ink-subtle">
            Create a “Transport” fee head under Finance → Fees first.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Month *" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />
          <Input
            label="Due day of month"
            type="number"
            min={1}
            max={31}
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
          />
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!headId}>
            Raise fees
          </Button>
        </div>
      </form>
    </Modal>
  );
}
