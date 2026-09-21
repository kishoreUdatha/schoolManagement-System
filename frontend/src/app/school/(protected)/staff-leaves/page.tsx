"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Field";
import {
  FilterBar,
  PanelFooter,
  PersonCell,
  StatStrip,
} from "@/components/ui/Workspace";
import { CalendarClock, CalendarDays, Hourglass, Users } from "lucide-react";
import { api, apiError } from "@/lib/api";

/** A select sized for the filter bar: same height as the search box, and
 *  no stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type LeaveKind = "casual" | "sick" | "earned" | "unpaid" | "other";
type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

type Leave = {
  id: number;
  applicant_user_id: number;
  applicant_name: string | null;
  applicant_role: string | null;
  kind: LeaveKind;
  from_date: string;
  to_date: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decided_by_name: string | null;
  decision_remark: string | null;
  decided_at: string | null;
  created_at: string;
};

function statusTone(s: LeaveStatus) {
  if (s === "approved") return "emerald" as const;
  if (s === "rejected") return "rose" as const;
  if (s === "cancelled") return "neutral" as const;
  return "amber" as const;
}

type Tab = "pending" | "history";

export default function StaffLeavesAdminPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [items, setItems] = useState<Leave[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<number | null>(null);
  const [remarkDraft, setRemarkDraft] = useState<Record<number, string>>({});

  async function load() {
    try {
      const params = tab === "pending" ? { status: "pending" } : {};
      const { data } = await api.get<Leave[]>("/api/v1/school/staff-leaves", {
        params,
      });
      const visible = tab === "history" ? data.filter((l) => l.status !== "pending") : data;
      setItems(visible);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function decide(l: Leave, status: "approved" | "rejected") {
    setDeciding(l.id);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/api/v1/school/staff-leaves/${l.id}/decide`, {
        status,
        decision_remark: remarkDraft[l.id]?.trim() || null,
      });
      setNotice(`Leave #${l.id} ${status}.`);
      await load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setDeciding(null);
    }
  }

  const pendingCount = items.filter((l) => l.status === "pending").length;
  const daysRequested = items.reduce((n, l) => n + l.days, 0);
  const applicants = new Set(items.map((l) => l.applicant_user_id)).size;

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Staff leaves"
        subtitle="Review and decide leave requests from teachers, principals, accountants, and non-teaching staff."
      />

      {/* Counted off the requests this tab already loaded — there is no
          summary endpoint, and inventing one is not the job of a heading. */}
      <StatStrip
        stats={[
          {
            label: "Requests",
            value: items.length,
            note: tab === "pending" ? "Awaiting a decision" : "Already decided",
            icon: CalendarDays,
          },
          {
            label: "Still pending",
            value: pendingCount,
            note: `of ${items.length} shown`,
            icon: Hourglass,
          },
          {
            label: "Days requested",
            value: daysRequested,
            note: "Across these requests",
            icon: CalendarClock,
          },
          {
            label: "Applicants",
            value: applicants,
            note: "Distinct staff members",
            icon: Users,
          },
        ]}
      />

      <FilterBar>
        <select
          aria-label="View"
          value={tab}
          onChange={(e) => setTab(e.target.value as Tab)}
          className={filterSelect}
        >
          <option value="pending">Pending</option>
          <option value="history">History</option>
        </select>
      </FilterBar>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">
          {notice}
        </div>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{tab === "pending" ? "Pending requests" : "Decision history"}</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {tab === "pending"
                ? "Each row can be approved or rejected here, with an optional remark."
                : "Requests that have already been approved, rejected or cancelled."}
            </p>
          </div>
        </CardHeader>
        <table className="min-w-full divide-y divide-surface-border text-[13px]">
          <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
            <tr>
              <th className="px-4 py-3 font-bold">Applicant</th>
              <th className="px-4 py-3 font-bold">Kind</th>
              <th className="px-4 py-3 font-bold">Dates</th>
              <th className="px-4 py-3 font-bold">Reason</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 text-right font-medium">Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {items.map((l) => (
              <tr key={l.id} className="hover:bg-surface-subtle">
                <td className="px-4 py-3">
                  <PersonCell
                    name={l.applicant_name ?? "—"}
                    sub={l.applicant_role}
                  />
                </td>
                <td className="px-4 py-3">
                  <Badge tone="brand">{l.kind}</Badge>
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  <div>
                    {l.from_date} → {l.to_date}
                  </div>
                  <div className="text-xs text-ink-subtle">
                    {l.days} day{l.days === 1 ? "" : "s"}
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {l.reason ? (
                    <p className="max-w-[28ch] whitespace-pre-line">{l.reason}</p>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {l.status === "pending" ? (
                    <div className="flex min-w-[220px] flex-col items-stretch gap-2">
                      <textarea
                        rows={2}
                        placeholder="Optional decision remark"
                        value={remarkDraft[l.id] ?? ""}
                        onChange={(e) =>
                          setRemarkDraft({ ...remarkDraft, [l.id]: e.target.value })
                        }
                        className="w-full rounded-md border border-surface-border bg-surface-subtle px-2 py-1.5 text-sm text-ink"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          loading={deciding === l.id}
                          onClick={() => decide(l, "approved")}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          loading={deciding === l.id}
                          onClick={() => decide(l, "rejected")}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-ink-muted">
                      <div>
                        Decided by {l.decided_by_name ?? "—"}{" "}
                        {l.decided_at && (
                          <span>on {new Date(l.decided_at).toLocaleString()}</span>
                        )}
                      </div>
                      {l.decision_remark && (
                        <p className="mt-1 whitespace-pre-line">
                          “{l.decision_remark}”
                        </p>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">
                  {tab === "pending"
                    ? "Nothing pending."
                    : "No decisions on record."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <PanelFooter
          left={`Showing ${items.length} request${items.length === 1 ? "" : "s"}`}
          right={`${daysRequested} day(s) across ${applicants} applicant(s)`}
        />
      </Card>
    </div>
  );
}
