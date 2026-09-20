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
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Daily absent</h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
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
        <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
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
            <table className="min-w-full divide-y divide-surface-border text-[13px]">
              <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                <tr>
                  <th className="px-4 py-3 font-bold">Class</th>
                  <th className="px-4 py-3 font-bold">Sec</th>
                  <th className="px-4 py-3 font-bold">Roll</th>
                  <th className="px-4 py-3 font-bold">Adm #</th>
                  <th className="px-4 py-3 font-bold">Student</th>
                  <th className="px-4 py-3 font-bold">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {rows.map((r) => (
                  <tr key={r.student_id}>
                    <td className="px-4 py-3">{r.class_name}</td>
                    <td className="px-4 py-3">{r.section_name}</td>
                    <td className="px-4 py-3">{r.roll_no}</td>
                    <td className="px-4 py-3 font-mono text-ink-muted">
                      {r.admission_no}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {r.full_name}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
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
