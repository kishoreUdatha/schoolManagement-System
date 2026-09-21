"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type Report = {
  id: number;
  week_start: string;
  week_end: string;
  attendance_pct: number;
  attendance_present: number;
  attendance_absent: number;
  attendance_late: number;
  homework_submitted: number;
  homework_total: number;
  homework_submission_pct: number;
  marks_summary: { papers: number; avg_pct: number; pass_rate_pct: number } | null;
  behaviour_avg: number | null;
  teacher_remark: string | null;
  generated_by_name: string | null;
  shared_at: string | null;
};

export default function ChildWeeklyReportsPage() {
  const params = useParams<{ id: string }>();
  const [items, setItems] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Report[]>(`/api/v1/parent/me/children/${params.id}/weekly-reports`)
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, [params.id]);

  return (
    <div className="space-y-4">
      <Link
        href={`/parent/children/${params.id}`}
        className="text-sm text-brand-400 hover:underline"
      >
        ← Back to child profile
      </Link>
      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Weekly reports</h1>
      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}
      {items === null ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : items.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-muted">
              No weekly reports shared yet.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle>
                  Week of {r.week_start}
                  <span className="ml-2 text-xs font-normal text-ink-subtle">
                    → {r.week_end}
                  </span>
                </CardTitle>
                <div className="text-xs text-ink-muted">
                  {r.generated_by_name && <>by {r.generated_by_name}</>}
                </div>
              </CardHeader>
              <CardBody>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                  <Stat label="Attendance" value={`${r.attendance_pct}%`} sub={`P ${r.attendance_present} · A ${r.attendance_absent} · L ${r.attendance_late}`} tone="emerald" />
                  <Stat
                    label="Homework"
                    value={`${r.homework_submitted}/${r.homework_total}`}
                    sub={`${r.homework_submission_pct}%`}
                    tone="brand"
                  />
                  <Stat
                    label="Marks"
                    value={r.marks_summary ? `${r.marks_summary.avg_pct}%` : "—"}
                    sub={r.marks_summary ? `${r.marks_summary.papers} papers` : ""}
                    tone="amber"
                  />
                  <Stat
                    label="Behaviour"
                    value={r.behaviour_avg != null ? `★ ${r.behaviour_avg}` : "—"}
                    sub=""
                  />
                </div>
                {r.teacher_remark && (
                  <div className="mt-3 rounded-md border border-surface-border bg-surface-subtle px-3 py-2 text-sm">
                    <div className="text-xs font-medium text-ink">
                      Teacher remark
                    </div>
                    <p className="mt-1 whitespace-pre-line text-ink-muted">
                      {r.teacher_remark}
                    </p>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "emerald" | "brand" | "amber";
}) {
  const valueClass =
    tone === "emerald"
      ? "text-success"
      : tone === "brand"
      ? "text-brand-300"
      : tone === "amber"
      ? "text-warning"
      : "text-ink";
  return (
    <div>
      <div className="text-xs text-ink-subtle">{label}</div>
      <div className={`text-xl font-semibold ${valueClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-ink-subtle">{sub}</div>}
    </div>
  );
}
