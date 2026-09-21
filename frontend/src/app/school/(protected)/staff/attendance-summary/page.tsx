"use client";

import { useCallback, useEffect, useState } from "react";

import { CalendarRange, Percent, TrendingDown, Users } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Table,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { readableDate, toIso } from "@/lib/dates";

const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Row = {
  user_id: number;
  name: string;
  role: string;
  present: number;
  late: number;
  absent: number;
  on_leave: number;
  sick: number;
  holiday: number;
  marked: number;
  percent: number;
};
type Summary = {
  year: number;
  month: number;
  from_date: string;
  to_date: string;
  working_days: number;
  staff: Row[];
};

function tone(pct: number): "emerald" | "amber" | "rose" {
  if (pct >= 95) return "emerald";
  if (pct >= 85) return "amber";
  return "rose";
}

/** A month of staff attendance per person, rather than a day at a time.
 *
 *  The daily screen answers "who is in today". This answers the question the
 *  office actually gets asked at the end of a month, which the daily screen
 *  could only answer by being opened thirty times.
 */
export default function StaffAttendanceSummaryPage() {
  const now = new Date();
  const [month, setMonth] = useState(toIso(now).slice(0, 7));
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const [year, m] = month.split("-");
    api
      .get<Summary>("/api/v1/school/staff-ops/attendance-summary", {
        params: { year: Number(year), month: Number(m) },
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = data?.staff ?? [];
  const average =
    rows.length > 0
      ? Math.round((rows.reduce((n, r) => n + r.percent, 0) / rows.length) * 10) / 10
      : 0;
  const below90 = rows.filter((r) => r.percent < 90).length;

  // The month the server answered for, and the days it actually covered.
  const monthName = data
    ? new Date(data.year, data.month - 1, 1).toLocaleDateString("en-GB", { month: "long" })
    : "—";
  const period = data
    ? `${readableDate(data.from_date)} – ${readableDate(data.to_date)}`
    : undefined;

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Staff attendance"
        subtitle="A whole month per person. Holidays are not counted as days anybody failed to turn up."
      />
      <ErrorBox>{error}</ErrorBox>

      {/* The month is picked before any of the figures below exist, so it
          belongs above them rather than beside the title. */}
      <FilterBar>
        <label className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
          Month
          <input
            type="month"
            aria-label="Month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className={filterSelect}
          />
        </label>
      </FilterBar>

      <StatStrip
        stats={[
          {
            label: "Staff in scope",
            value: rows.length,
            note: data ? `${data.working_days} working day(s)` : undefined,
            icon: Users,
          },
          {
            label: "Reporting period",
            value: monthName,
            note: period,
            icon: CalendarRange,
          },
          {
            label: "Average attendance",
            value: rows.length ? `${average}%` : "—",
            note: "Across everybody marked",
            icon: Percent,
          },
          {
            label: "Below 90%",
            value: below90,
            note: rows.length ? `Of ${rows.length} marked` : undefined,
            icon: TrendingDown,
          },
        ]}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Everybody</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {period ? `${monthName} · ${period}` : "This month"}
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={[
              "Name",
              "Role",
              "Present",
              "Late",
              "Absent",
              "On leave",
              "Sick",
              "Days marked",
              "Attendance",
            ]}
            empty={
              rows.length === 0 &&
              "Nobody's attendance has been marked for this month yet."
            }
          >
            {rows.map((r) => (
              <tr key={r.user_id}>
                <td className={tdStrong}>{r.name}</td>
                <td className={td}>{humanize(r.role)}</td>
                <td className={td}>{r.present}</td>
                <td className={td}>{r.late || "—"}</td>
                <td className={td}>{r.absent || "—"}</td>
                <td className={td}>{r.on_leave || "—"}</td>
                <td className={td}>{r.sick || "—"}</td>
                <td className={td}>{r.marked}</td>
                <td className={td}>
                  {r.marked === 0 ? (
                    <span className="text-ink-subtle">—</span>
                  ) : (
                    <Badge tone={tone(r.percent)}>{r.percent}%</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`Showing ${rows.length} member(s) of staff`}
          right={data ? `${data.working_days} working day(s) in ${monthName}` : undefined}
        />
      </Card>

      <p className="text-[12px] text-ink-subtle">
        Late counts as present — somebody who arrived at nine twenty was still
        at work that day.
      </p>
    </div>
  );
}
