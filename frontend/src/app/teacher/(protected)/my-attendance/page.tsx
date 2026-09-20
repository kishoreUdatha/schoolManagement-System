"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Status = "present" | "late" | "absent" | "on_leave" | "sick" | "holiday";

type AttendanceRow = {
  id: number;
  date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: Status;
  manually_overridden: boolean;
  override_remark: string | null;
};

type History = {
  year: number;
  month: number;
  summary: {
    total_days: number;
    present: number;
    late: number;
    absent: number;
    on_leave: number;
    sick: number;
    holiday: number;
  };
  records: AttendanceRow[];
};

const statusTone: Record<Status, "emerald" | "amber" | "rose" | "neutral" | "brand"> = {
  present: "emerald",
  late: "amber",
  absent: "rose",
  on_leave: "neutral",
  sick: "neutral",
  holiday: "brand",
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MyAttendancePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<History>(`/api/v1/staff/attendance/history?year=${year}&month=${month}`)
      .then((r) => setHistory(r.data))
      .catch((e) => setError(apiError(e)));
  }, [year, month]);

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) { m += 12; y -= 1; }
    else if (m > 12) { m -= 12; y += 1; }
    setYear(y); setMonth(m);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">My attendance</h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Daily check-ins for this month. Late detection compares your check-in
          time to the school&apos;s start time + 15 min grace.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => shiftMonth(-1)}>
          ← Prev
        </Button>
        <span className="text-base font-semibold text-slate-900">
          {MONTHS[month - 1]} {year}
        </span>
        <Button size="sm" variant="secondary" onClick={() => shiftMonth(1)}>
          Next →
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}

      {history && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Records" value={history.summary.total_days} />
            <StatCard label="Present" value={history.summary.present} accent="emerald" />
            <StatCard label="Late" value={history.summary.late} accent="amber" />
            <StatCard label="Absent" value={history.summary.absent} accent="rose" />
            <StatCard label="On leave" value={history.summary.on_leave} />
            <StatCard label="Sick" value={history.summary.sick} />
          </div>

          <Card>
            <table className="min-w-full divide-y divide-surface-border text-[13px]">
              <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                <tr>
                  <th className="px-4 py-3 font-bold">Date</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Check-in</th>
                  <th className="px-4 py-3 font-bold">Check-out</th>
                  <th className="px-4 py-3 font-bold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-[12px] tabular-nums">{r.date}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                      {r.manually_overridden && (
                        <span className="ml-2 text-xs text-slate-500">(overridden)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{fmtTime(r.check_in_at)}</td>
                    <td className="px-4 py-3">{fmtTime(r.check_out_at)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {r.override_remark || ""}
                    </td>
                  </tr>
                ))}
                {history.records.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No records for this month.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
