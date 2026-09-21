"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AlertTriangle, CalendarCheck, CheckCircle2, Gauge, Grid3x3, Hourglass, LayoutGrid } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Table, WarnBox, td, tdStrong } from "@/components/ui/Field";
import { PanelFooter, QuickActions, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type SectionRow = {
  section_id: number;
  class_name: string;
  section_name: string;
  filled: number;
  slots: number;
  percent: number;
  empty: number;
};
type Clash = {
  teacher_id: number;
  teacher_name: string | null;
  day_of_week: number | null;
  period_number: number | null;
  sections: number;
};
type Dashboard = {
  teaching_slots_per_week: number;
  sections: SectionRow[];
  complete: number;
  not_started: number;
  percent: number;
  clashes: Clash[];
};

/** Every timetable at once.
 *
 *  A clash list answers "is anything broken". The question asked first is "is
 *  anything finished", so completeness leads and the clashes sit above it as
 *  the one thing here that is wrong rather than merely unfinished.
 */
export default function TimetableDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Dashboard>("/api/v1/school/timetable-gen/dashboard")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const rows = data?.sections ?? [];
  const clashes = data?.clashes ?? [];

  return (
    <div className="space-y-[18px]">
      {/* No welcome band. This is a dashboard for one week's timetable, not
          somebody's landing page, and "Good morning" above a clash list is
          the wrong voice for the one screen that says the week cannot be
          taught. The two secondary links moved down into the quick actions
          so the header carries the single thing this page is for. */}
      <PageHeader
        title="Timetables"
        subtitle="How far each section's week has got, and anything that cannot stand."
        actions={
          <Link href="/school/timetable/generate">
            <Button>Generate</Button>
          </Link>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <StatStrip
        stats={[
          {
            label: "Sections finished",
            value: data ? `${data.complete} of ${rows.length}` : "—",
            icon: CheckCircle2,
          },
          { label: "Not started", value: data?.not_started ?? "—", icon: Hourglass },
          {
            label: "Slots filled",
            value: data ? `${data.percent}%` : "—",
            note: data ? `${data.teaching_slots_per_week} teaching slots a week` : undefined,
            icon: Gauge,
          },
          { label: "Teacher clashes", value: clashes.length, icon: AlertTriangle },
        ]}
      />

      <QuickActions
        actions={[
          { label: "Day view", href: "/school/timetable/coordinator", icon: LayoutGrid },
          { label: "Availability", href: "/school/timetable/availability", icon: CalendarCheck },
          { label: "Period setup", href: "/school/timetable/setup", icon: Grid3x3 },
        ]}
      />

      {clashes.length > 0 && (
        <WarnBox>
          {clashes.length === 1 ? "A teacher is" : `${clashes.length} teachers are`} timetabled
          in more than one room at the same hour. Until that is fixed the week cannot be
          taught as it stands:{" "}
          {clashes
            .map(
              (c) =>
                `${c.teacher_name ?? "somebody"} on ${
                  c.day_of_week ? DAYS[c.day_of_week - 1] : "an unknown day"
                } P${c.period_number ?? "?"} (${c.sections} sections)`
            )
            .join("; ")}
          .
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Section by section</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Class", "Section", "Filled", "Progress", "Empty", ""]}
            empty={rows.length === 0 && "No sections have been set up yet."}
          >
            {rows.map((r) => (
              <tr key={r.section_id}>
                <td className={tdStrong}>{r.class_name}</td>
                <td className={td}>{r.section_name}</td>
                <td className={td}>
                  {r.filled} <span className="text-ink-subtle">/ {r.slots}</span>
                </td>
                <td className={td}>
                  <div className="flex items-center gap-2">
                    {/* A bar reads faster than a number when scanning thirty
                        rows for the one nobody has started. */}
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-subtle">
                      <span
                        className={
                          "block h-full rounded-full " +
                          (r.percent >= 100
                            ? "bg-success"
                            : r.percent > 0
                            ? "bg-brand-600"
                            : "bg-transparent")
                        }
                        style={{ width: `${Math.min(r.percent, 100)}%` }}
                      />
                    </span>
                    <span className="tabular-nums">{r.percent}%</span>
                  </div>
                </td>
                <td className={td}>
                  {r.empty === 0 ? (
                    <Badge tone="emerald">Full</Badge>
                  ) : r.filled === 0 ? (
                    <Badge tone="neutral">Not started</Badge>
                  ) : (
                    <Badge tone="amber">{r.empty} free</Badge>
                  )}
                </td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Link
                      href={`/school/timetable/setup?section=${r.section_id}`}
                      className="font-bold text-brand-600 hover:underline"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/school/timetable/generate?section=${r.section_id}`}
                      className="font-bold text-brand-600 hover:underline"
                    >
                      Generate
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        {data && (
          <PanelFooter
            left={`${rows.length} section${rows.length === 1 ? "" : "s"} · ${data.complete} finished`}
            right={data.not_started ? `${data.not_started} not started` : "Every section has been started"}
          />
        )}
      </Card>
    </div>
  );
}
