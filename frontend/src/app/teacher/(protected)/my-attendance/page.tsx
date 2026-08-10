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
        <h1 className="text-2xl font-bold text-slate-900">My attendance</h1>
        <p className="mt-1 text-sm text-slate-500">
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
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
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
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Check-in</th>
                  <th className="px-4 py-2 font-medium">Check-out</th>
                  <th className="px-4 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs">{r.date}</td>
                    <td className="px-4 py-2">
                      <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                      {r.manually_overridden && (
                        <span className="ml-2 text-xs text-slate-500">(overridden)</span>
                      )}
                    </td>
                    <td className="px-4 py-2">{fmtTime(r.check_in_at)}</td>
                    <td className="px-4 py-2">{fmtTime(r.check_out_at)}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">
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
