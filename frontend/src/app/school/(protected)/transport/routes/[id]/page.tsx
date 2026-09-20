"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Table,
  WarnBox,
  humanize,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { hhmm, readableDate } from "@/lib/dates";

type Stop = {
  id: number;
  name: string;
  sequence: number;
  pickup_time: string | null;
  drop_time: string | null;
  monthly_fee: string | null;
  effective_fee: string;
  lat: number | null;
  lng: number | null;
  student_count: number;
};

type Route = {
  id: number;
  name: string;
  code: string;
  vehicle_id: number | null;
  vehicle_label: string | null;
  vehicle_capacity: number | null;
  monthly_fee: string;
  is_active: boolean;
  stops: Stop[];
  student_count: number;
};

type Assignment = {
  id: number;
  student_id: number;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  route_id: number;
  route_name: string;
  stop_id: number;
  stop_name: string;
  pickup_time: string | null;
  drop_time: string | null;
  direction: string;
  monthly_fee: string;
  start_date: string;
  end_date: string | null;
};

type RouteUtilisation = {
  route_id: number;
  route_name: string;
  vehicle: string | null;
  capacity: number;
  riders: number;
  free_seats: number;
  utilisation: number;
  over_capacity: boolean;
};

export default function RouteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [route, setRoute] = useState<Route | null>(null);
  const [riders, setRiders] = useState<Assignment[]>([]);
  const [usage, setUsage] = useState<RouteUtilisation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Route>(`/api/v1/school/transport/routes/${id}`)
      .then((r) => setRoute(r.data))
      .catch((e) => setError(apiError(e)));
    api
      .get<Assignment[]>("/api/v1/school/transport/assignments", {
        params: { route_id: Number(id) },
      })
      .then((r) => setRiders(r.data))
      .catch((e) => setError(apiError(e)));
    // Utilisation is computed once for every route; pick ours out rather than
    // recounting riders here, so this page and the report cannot disagree.
    api
      .get<{ routes: RouteUtilisation[] }>("/api/v1/school/analytics/transport")
      .then((r) => setUsage(r.data.routes.find((x) => x.route_id === Number(id)) ?? null))
      .catch(() => setUsage(null));
  }, [id]);

  const stops = [...(route?.stops ?? [])].sort((a, b) => a.sequence - b.sequence);

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
        title={route ? route.name : "Route"}
        subtitle={route ? `Code ${route.code}` : "Loading…"}
        actions={route && !route.is_active ? <Badge tone="neutral">Not running</Badge> : undefined}
      />
      <ErrorBox>{error}</ErrorBox>

      {route && !route.vehicle_id && (
        <WarnBox>
          No vehicle is assigned to this route, so there is nothing to work out seats
          against and no bus for the children on it to get on.
        </WarnBox>
      )}

      {usage?.over_capacity && (
        <WarnBox>
          {usage.riders} children are assigned to a vehicle with {usage.capacity} seats.
        </WarnBox>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Riders" value={route?.student_count ?? "—"} />
        <StatCard
          label="Seats"
          value={route?.vehicle_capacity ?? "Not set"}
          hint={route?.vehicle_id ? undefined : "No vehicle"}
        />
        <StatCard
          label="Full"
          value={usage && usage.capacity ? `${usage.utilisation}%` : "—"}
          accent={usage?.over_capacity ? "rose" : usage && usage.utilisation > 90 ? "amber" : "emerald"}
        />
        <StatCard label="Monthly fee" value={route ? inr(route.monthly_fee) : "—"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vehicle</CardTitle>
        </CardHeader>
        <CardBody>
          {route?.vehicle_id ? (
            <Link
              href={`/school/transport/vehicles/${route.vehicle_id}`}
              className="text-[15px] font-extrabold text-brand-600 hover:underline"
            >
              {route.vehicle_label ?? `Vehicle ${route.vehicle_id}`}
            </Link>
          ) : (
            <p className="text-[13px] text-ink-subtle">Nothing assigned yet.</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stops</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["#", "Stop", "Pickup", "Drop", "Fee", "Riders"]}
            empty={stops.length === 0 && "No stops have been added to this route yet."}
          >
            {stops.map((s) => (
              <tr key={s.id}>
                <td className={td}>{s.sequence}</td>
                <td className={tdStrong}>{s.name}</td>
                <td className={td}>{s.pickup_time ? hhmm(s.pickup_time) : "—"}</td>
                <td className={td}>{s.drop_time ? hhmm(s.drop_time) : "—"}</td>
                <td className={td}>
                  {inr(s.effective_fee)}
                  {s.monthly_fee === null && (
                    <span className="block text-[11px] text-ink-subtle">from the route</span>
                  )}
                </td>
                <td className={td}>{s.student_count}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who rides it</CardTitle>
          <span className="text-[12px] font-bold text-ink-muted">{riders.length} child(ren)</span>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Admission no", "Student", "Stop", "Direction", "Fee", "Since"]}
            empty={riders.length === 0 && "Nobody has been assigned to this route yet."}
          >
            {riders.map((a) => (
              <tr key={a.id}>
                <td className={td}>{a.admission_no}</td>
                <td className={tdStrong}>
                  <Link href={`/school/students/${a.student_id}`} className="hover:underline">
                    {a.student_name}
                  </Link>
                  {a.section_label && (
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      {a.section_label}
                    </span>
                  )}
                </td>
                <td className={td}>{a.stop_name}</td>
                <td className={td}>{humanize(a.direction)}</td>
                <td className={td}>{inr(a.monthly_fee)}</td>
                <td className={td}>{readableDate(a.start_date)}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
