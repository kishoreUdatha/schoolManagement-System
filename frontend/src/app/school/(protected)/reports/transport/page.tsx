"use client";

import { useEffect, useState } from "react";

import { Armchair, Bus, Percent, Users } from "lucide-react";

import { BreakdownChart, ChartCard } from "@/components/charts/Charts";
import { SERIES } from "@/components/charts/theme";
import { ReportShell } from "@/components/reports/ReportShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, WarnBox, td, tdStrong } from "@/components/ui/Field";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type RouteRow = {
  route_id: number;
  route_name: string;
  vehicle: string | null;
  capacity: number;
  riders: number;
  free_seats: number;
  utilisation: number;
  over_capacity: boolean;
};
type Transport = {
  routes: RouteRow[];
  total_capacity: number;
  total_riders: number;
  utilisation: number;
  over_capacity: RouteRow[];
};

/** Seats bought against seats used.
 *
 *  Utilisation reads the opposite way round to the other reports here: a
 *  route at 100% is a bus with a child standing, not a job well done.
 */
function utilisationTone(route: RouteRow): "emerald" | "amber" | "rose" {
  if (route.over_capacity) return "rose";
  if (route.utilisation > 90) return "amber";
  return "emerald";
}

export default function TransportReportPage() {
  const [data, setData] = useState<Transport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Transport>("/api/v1/school/analytics/transport")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const routes = data?.routes ?? [];
  const over = data?.over_capacity ?? [];
  const seated = routes.filter((r) => r.capacity > 0).length;

  return (
    <ReportShell
      title="Transport utilisation"
      subtitle="How many children ride each route, against how many seats the vehicle on it has."
      error={error}
    >
      {over.length > 0 && (
        <WarnBox>
          {over.length === 1 ? "One route is" : `${over.length} routes are`} carrying more children
          than the vehicle seats: {over.map((r) => r.route_name).join(", ")}. This needs sorting
          today, not at the end of the term.
        </WarnBox>
      )}

      {/* No filter bar: every route the school runs is in scope, so the strip
          restates how many that is rather than what was chosen. */}
      <StatStrip
        stats={[
          {
            label: "Routes in scope",
            value: data ? routes.length : "—",
            note: data ? `${seated} with a vehicle capacity recorded` : undefined,
            icon: Bus,
          },
          {
            label: "Riders",
            value: data?.total_riders ?? "—",
            note: "Children allocated to a route",
            icon: Users,
          },
          {
            label: "Seats",
            value: data ? data.total_capacity || "Not set" : "—",
            note: data && !data.total_capacity ? "No vehicle capacities recorded" : undefined,
            icon: Armchair,
          },
          {
            label: "Overall utilisation",
            value: data?.total_capacity ? `${data.utilisation}%` : "—",
            note: data
              ? over.length
                ? `${over.length} route(s) over capacity`
                : "No route is over capacity"
              : undefined,
            icon: Percent,
          },
        ]}
      />

      <ChartCard
        title="Route by route"
        subtitle="Riders against the seats still free on the same vehicle."
        empty={routes.length === 0 && "No routes have been set up yet."}
        height={Math.max(280, routes.length * 34)}
      >
        <BreakdownChart
          data={routes.map((r) => ({
            route_name: r.route_name,
            Riders: r.riders,
            "Free seats": r.free_seats,
          }))}
          x="route_name"
          layout="vertical"
          stacked
          series={[
            { key: "Riders", name: "Riders", color: SERIES[0] },
            { key: "Free seats", name: "Free seats", color: SERIES[7] },
          ]}
        />
      </ChartCard>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Routes</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Riders against the seats on the vehicle assigned to each route.
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Route", "Vehicle", "Riders", "Seats", "Free", "Utilisation"]}
            empty={routes.length === 0 && "No routes have been set up yet."}
          >
            {routes.map((r) => (
              <tr key={r.route_id}>
                <td className={tdStrong}>{r.route_name}</td>
                <td className={td}>
                  {r.vehicle ?? <span className="text-ink-subtle">None assigned</span>}
                </td>
                <td className={tdStrong}>{r.riders}</td>
                <td className={td}>{r.capacity || "—"}</td>
                <td className={td}>{r.capacity ? r.free_seats : "—"}</td>
                <td className={td}>
                  {r.capacity ? (
                    <Badge tone={utilisationTone(r)}>{r.utilisation}%</Badge>
                  ) : (
                    <span className="text-ink-subtle">Not set</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`Showing ${routes.length} route(s)`}
          right={data ? `${data.total_riders} rider(s) in total` : undefined}
        />
      </Card>
    </ReportShell>
  );
}
