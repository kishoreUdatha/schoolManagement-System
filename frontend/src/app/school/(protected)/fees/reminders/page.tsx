"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type ReminderKind =
  | "pre_due_7"
  | "pre_due_1"
  | "overdue_1"
  | "overdue_7"
  | "overdue_30";

type ReminderLog = {
  id: number;
  student_fee_id: number;
  student_name: string | null;
  student_admission_no: string | null;
  kind: ReminderKind;
  send_date: string;
  sent_at: string;
  notice_id: number | null;
};

type RunResult = {
  candidates: number;
  sent: number;
  skipped_already_sent: number;
  by_kind: Record<string, number>;
};

function kindTone(k: ReminderKind) {
  return k.startsWith("overdue") ? ("rose" as const) : ("amber" as const);
}

const kindLabel: Record<ReminderKind, string> = {
  pre_due_7: "Due in 7 days",
  pre_due_1: "Due in 1 day",
  overdue_1: "Overdue 1 day",
  overdue_7: "Overdue 7 days",
  overdue_30: "Overdue 30 days",
};

export default function FeeRemindersPage() {
  const [items, setItems] = useState<ReminderLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);

  async function load() {
    try {
      const { data } = await api.get<ReminderLog[]>(
        "/api/v1/school/fees/reminders"
      );
      setItems(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function runNow() {
    setRunning(true);
    setError(null);
    try {
      const { data } = await api.post<RunResult>(
        "/api/v1/school/fees/reminders/run"
      );
      setLastRun(data);
      await load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Link href="/school/fees" className="hover:underline">
              Fees
            </Link>
            <span className="text-ink-subtle">/</span>
            <span>Reminders</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Fee reminders</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Automatic reminders sent at <strong>7 days</strong> and{" "}
            <strong>1 day</strong> before the due date, and at{" "}
            <strong>1 / 7 / 30 days</strong> after.
          </p>
        </div>
        <Button onClick={runNow} loading={running}>
          Send reminders now
        </Button>
      </div>

      <Card>
        <CardBody>
          <p className="text-xs text-ink-subtle">
            The scheduler runs once every 24 hours in the background. Use{" "}
            <em>Send reminders now</em> to trigger an extra run on demand —
            sends are idempotent so re-running is safe.
          </p>
        </CardBody>
      </Card>

      {lastRun && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Last run: <strong>{lastRun.sent}</strong> reminder
          {lastRun.sent === 1 ? "" : "s"} sent
          {lastRun.skipped_already_sent > 0 &&
            ` · ${lastRun.skipped_already_sent} skipped (already sent today)`}
          {Object.keys(lastRun.by_kind).length > 0 && (
            <div className="mt-1 text-xs text-emerald-200">
              {Object.entries(lastRun.by_kind)
                .map(
                  ([k, n]) =>
                    `${kindLabel[k as ReminderKind] ?? k}: ${n}`
                )
                .join(" · ")}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent reminders</CardTitle>
          <div className="text-xs text-ink-subtle">
            {items?.length ?? 0} entries
          </div>
        </CardHeader>
        <CardBody>
          {items === null ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-ink-muted">No reminders sent yet.</p>
          ) : (
            <table className="min-w-full divide-y divide-surface-border text-sm">
              <thead className="text-left text-xs uppercase text-ink-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Sent at</th>
                  <th className="px-3 py-2 font-medium">Kind</th>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Fee ID</th>
                  <th className="px-3 py-2 font-medium">Notice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {items.map((l) => (
                  <tr key={l.id} className="hover:bg-surface-hover">
                    <td className="px-3 py-2 text-ink-muted">
                      {new Date(l.sent_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={kindTone(l.kind)}>{kindLabel[l.kind]}</Badge>
                    </td>
                    <td className="px-3 py-2 text-ink">
                      <div className="font-medium">{l.student_name ?? "—"}</div>
                      {l.student_admission_no && (
                        <div className="font-mono text-xs text-ink-subtle">
                          {l.student_admission_no}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-ink-muted">
                      #{l.student_fee_id}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-subtle">
                      {l.notice_id ? `#${l.notice_id}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
