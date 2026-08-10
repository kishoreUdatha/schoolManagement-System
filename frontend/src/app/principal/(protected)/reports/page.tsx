"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type DailyAbsentRow = {
  student_id: number;
  admission_no: string;
  full_name: string;
  roll_no: number;
  class_name: string;
  section_name: string;
  remark: string | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function PrincipalReportsPage() {
  const [onDate, setOnDate] = useState(todayIso());
  const [rows, setRows] = useState<DailyAbsentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { data } = await api.get<DailyAbsentRow[]>(
        "/api/v1/school/reports/attendance/daily-absent",
        { params: { date: onDate } }
      );
      setRows(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDate]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">Daily absent</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Students marked absent across all sections.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardBody>
          <label className="flex items-end gap-2 text-sm">
            <div>
              <div className="text-xs text-ink-muted">Date</div>
              <input
                type="date"
                value={onDate}
                onChange={(e) => setOnDate(e.target.value)}
                max={todayIso()}
                className="mt-1 rounded-lg border border-surface-border bg-surface-subtle px-3 py-1.5 text-sm"
              />
            </div>
          </label>
        </CardBody>
      </Card>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {rows ? <Badge tone="rose">{rows.length} absent</Badge> : "Loading…"}
          </CardTitle>
        </CardHeader>
        <CardBody>
          {rows && rows.length === 0 && (
            <p className="text-sm text-ink-muted">No absences on this date.</p>
          )}
          {rows && rows.length > 0 && (
            <table className="min-w-full divide-y divide-surface-border text-sm">
              <thead className="text-left text-xs uppercase text-ink-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Class</th>
                  <th className="px-3 py-2 font-medium">Sec</th>
                  <th className="px-3 py-2 font-medium">Roll</th>
                  <th className="px-3 py-2 font-medium">Adm #</th>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {rows.map((r) => (
                  <tr key={r.student_id}>
                    <td className="px-3 py-2">{r.class_name}</td>
                    <td className="px-3 py-2">{r.section_name}</td>
                    <td className="px-3 py-2">{r.roll_no}</td>
                    <td className="px-3 py-2 font-mono text-ink-muted">
                      {r.admission_no}
                    </td>
                    <td className="px-3 py-2 font-medium text-ink">
                      {r.full_name}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      {r.remark || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <p className="text-xs text-ink-subtle">
        Class summary and per-student monthly views are available to school
        admin under <code>/school/reports/attendance</code>. They&apos;ll be
        added here in a follow-up.
      </p>
    </div>
  );
}
