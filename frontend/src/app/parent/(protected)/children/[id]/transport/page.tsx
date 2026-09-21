"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type ChildTransport = {
  route_name: string;
  stop_name: string;
  pickup_time: string | null;
  drop_time: string | null;
  direction: "both" | "pickup" | "drop";
  vehicle_label: string | null;
  registration_no: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
  today: {
    direction: "pickup" | "drop";
    trip_status: string;
    boarding_status: "boarded" | "dropped" | "absent" | null;
    marked_at: string | null;
  }[];
};

export default function ChildTransportPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<ChildTransport | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      api
        .get<ChildTransport | null>(`/api/v1/parent/me/children/${params.id}/transport`)
        .then((r) => setData(r.data))
        .catch((e) => setError(apiError(e)));
    load();
    const t = setInterval(load, 30_000); // keep bus location fresh
    return () => clearInterval(t);
  }, [params.id]);

  const minutesAgo =
    data?.last_location_at != null
      ? Math.round((Date.now() - new Date(data.last_location_at).getTime()) / 60000)
      : null;

  return (
    <div className="space-y-4">
      <Link href={`/parent/children/${params.id}`} className="text-sm text-brand-700 hover:underline">
        ← Back
      </Link>
      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">School transport</h1>
      {error && <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>}
      {data === null && (
        <Card className="p-6 text-sm text-ink-muted">Your child isn’t using school transport.</Card>
      )}
      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{data.route_name}</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink-muted">Stop</dt>
                  <dd className="font-medium">{data.stop_name}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Timings</dt>
                  <dd className="font-medium">
                    {data.direction !== "drop" && `Pickup ${data.pickup_time?.slice(0, 5) ?? "—"}`}
                    {data.direction === "both" && " · "}
                    {data.direction !== "pickup" && `Drop ${data.drop_time?.slice(0, 5) ?? "—"}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Vehicle</dt>
                  <dd className="font-medium">
                    {data.vehicle_label ?? "—"} {data.registration_no && `(${data.registration_no})`}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Driver</dt>
                  <dd className="font-medium">
                    {data.driver_name ?? "—"}{" "}
                    {data.driver_phone && (
                      <a href={`tel:${data.driver_phone}`} className="text-brand-700 hover:underline">
                        {data.driver_phone}
                      </a>
                    )}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Today</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              {data.today.length === 0 && <div className="text-ink-muted">No trips recorded yet today.</div>}
              {data.today.map((t) => (
                <div key={t.direction} className="flex items-center justify-between">
                  <span className="capitalize">{t.direction === "pickup" ? "Morning pickup" : "Afternoon drop"}</span>
                  <span>
                    {t.boarding_status ? (
                      <Badge tone={t.boarding_status === "absent" ? "rose" : "emerald"}>
                        {t.boarding_status}
                        {t.marked_at && ` · ${new Date(t.marked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                      </Badge>
                    ) : (
                      <Badge>{t.trip_status.replace("_", " ")}</Badge>
                    )}
                  </span>
                </div>
              ))}
            </CardBody>
          </Card>

          {data.last_lat != null && data.last_lng != null && (
            <Card>
              <CardHeader>
                <CardTitle>Bus location</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2 text-sm">
                <div className="text-ink-muted">
                  Last updated {minutesAgo !== null && minutesAgo < 1 ? "just now" : `${minutesAgo} min ago`}
                </div>
                <iframe
                  title="Bus location"
                  className="h-64 w-full rounded-lg border-0"
                  loading="lazy"
                  src={`https://maps.google.com/maps?q=${data.last_lat},${data.last_lng}&z=15&output=embed`}
                />
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
