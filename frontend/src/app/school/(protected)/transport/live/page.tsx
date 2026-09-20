"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  WarnBox,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type Vehicle = {
  id: number;
  registration_no: string;
  label: string | null;
  kind: string;
  capacity: number;
  gps_enabled: boolean;
  last_lat: number | null;
  last_lng: number | null;
  last_speed_kmph: number | null;
  last_location_at: string | null;
  assigned_students: number;
  is_active: boolean;
};

/** A reading older than this is history, not a position. Fifteen minutes is
 *  about how long a bus takes to be somewhere else entirely. */
const STALE_MINUTES = 15;

function minutesAgo(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((Date.now() - then) / 60_000));
}

function ago(mins: number): string {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour(s) ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

function mapLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

export default function LiveBusesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    api
      .get<Vehicle[]>("/api/v1/school/transport/vehicles")
      .then((r) => {
        setVehicles(r.data.filter((v) => v.is_active));
        setCheckedAt(new Date());
      })
      .catch((e) => setError(apiError(e)))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Freshest first, never-reported last: the useful readings sit at the top
  // and the vehicles with no GPS at all stay out of the way.
  const sorted = [...vehicles].sort((a, b) => {
    const am = minutesAgo(a.last_location_at);
    const bm = minutesAgo(b.last_location_at);
    if (am === null && bm === null) return 0;
    if (am === null) return 1;
    if (bm === null) return -1;
    return am - bm;
  });

  const reporting = vehicles.filter((v) => v.last_location_at).length;
  const fresh = vehicles.filter((v) => {
    const m = minutesAgo(v.last_location_at);
    return m !== null && m <= STALE_MINUTES;
  }).length;
  const noGps = vehicles.filter((v) => !v.gps_enabled).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Where the buses are"
        subtitle="The last position each vehicle reported. Not a live feed — a bus only appears here when its tracker sends something."
        actions={
          <Button variant="secondary" onClick={load} loading={busy}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Check again
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <NoticeBox>
        A reading more than {STALE_MINUTES} minutes old is marked stale. Treat it as where
        the bus was, not where it is — at road speed that is several miles of difference.
      </NoticeBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Vehicles on the road" value={vehicles.length} />
        <StatCard label="Have ever reported" value={reporting} />
        <StatCard
          label={`Reported in ${STALE_MINUTES} min`}
          value={fresh}
          accent={fresh ? "emerald" : "brand"}
        />
        <StatCard
          label="No tracker fitted"
          value={noGps}
          accent={noGps ? "amber" : "emerald"}
        />
      </div>

      {noGps > 0 && (
        <WarnBox>
          {noGps} vehicle(s) have no tracker set up, so they will never show a position
          here however long you wait.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Last known positions</CardTitle>
          {checkedAt && (
            <span className="text-[12px] font-bold text-ink-muted">
              Checked at {checkedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Vehicle", "Riders", "Reported", "Speed", "Position", ""]}
            empty={vehicles.length === 0 && "No vehicles are on the road yet."}
          >
            {sorted.map((v) => {
              const mins = minutesAgo(v.last_location_at);
              const stale = mins !== null && mins > STALE_MINUTES;
              const hasFix = v.last_lat !== null && v.last_lng !== null;
              return (
                <tr key={v.id}>
                  <td className={tdStrong}>
                    <Link
                      href={`/school/transport/vehicles/${v.id}`}
                      className="hover:underline"
                    >
                      {v.registration_no}
                    </Link>
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      {[humanize(v.kind), v.label].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className={td}>
                    {v.assigned_students}
                    <span className="text-ink-subtle"> / {v.capacity}</span>
                  </td>
                  <td className={td}>
                    {mins === null ? (
                      <span className="text-ink-subtle">Never reported</span>
                    ) : (
                      <Badge tone={stale ? "amber" : "emerald"}>{ago(mins)}</Badge>
                    )}
                  </td>
                  <td className={td}>
                    {v.last_speed_kmph !== null ? `${Math.round(v.last_speed_kmph)} km/h` : "—"}
                  </td>
                  <td className={td}>
                    {hasFix ? (
                      <span className="font-mono text-[11px]">
                        {v.last_lat!.toFixed(4)}, {v.last_lng!.toFixed(4)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={td}>
                    {hasFix && (
                      <a
                        href={mapLink(v.last_lat!, v.last_lng!)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-brand-600 hover:underline"
                      >
                        Map
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
