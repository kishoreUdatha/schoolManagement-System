"use client";

import { useCallback, useEffect, useState } from "react";

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
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { readableDate, toIso } from "@/lib/dates";

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff attendance"
        subtitle="A whole month per person. Holidays are not counted as days anybody failed to turn up."
        actions={
          <label className="text-[12px] font-bold text-ink-muted">
            <span className="mb-1 block">Month</span>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Working days" value={data?.working_days ?? "—"} />
        <StatCard label="Staff marked" value={rows.length} />
        <StatCard
          label="Average attendance"
          value={rows.length ? `${average}%` : "—"}
          accent={rows.length ? tone(average) : "brand"}
        />
        <StatCard
          label="Below 90%"
          value={below90}
          accent={below90 ? "amber" : "emerald"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {data
              ? `${readableDate(data.from_date)} to ${readableDate(data.to_date)}`
              : "This month"}
          </CardTitle>
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
      </Card>

      <p className="text-[12px] text-ink-subtle">
        Late counts as present — somebody who arrived at nine twenty was still
        at work that day.
      </p>
    </div>
  );
}
