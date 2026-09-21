"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Table, humanize, td, tdStrong } from "@/components/ui/Field";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { Gavel, Hourglass, Inbox } from "lucide-react";
import { api, apiError } from "@/lib/api";

export type StudentLeave = {
  id: number;
  student_id: number;
  student_name: string;
  section_label: string;
  kind: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  applied_by_name: string | null;
  created_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  can_decide: boolean;
};

export const leaveTone = { pending: "amber", approved: "emerald", rejected: "rose", cancelled: "neutral" } as const;

/** A select sized for the filter bar: same height as the rest of the row,
 *  and no stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

const STATUS_LABEL: Record<string, string> = {
  "": "Every status",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Whole days since a timestamp — how long the oldest request has stood. */
function daysWaiting(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

/** Review queue for class teachers (their sections) and admin/principal (all). */
export function StudentLeaves() {
  const [items, setItems] = useState<StudentLeave[]>([]);
  const [status, setStatus] = useState("pending");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api
      .get<StudentLeave[]>("/api/v1/school/student-leaves", { params: status ? { status } : {} })
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function decide(lv: StudentLeave, approve: boolean) {
    const note = window.prompt(approve ? "Note for the parent (optional)" : "Why is it not approved? (required)", "");
    if (note === null) return;
    try {
      await api.post(`/api/v1/school/student-leaves/${lv.id}/decide`, { approve, note: note.trim() || null });
      setNotice(approve ? "Approved. The parent was notified." : "Rejected. The parent was notified.");
      setError(null);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  const waiting = items.filter((lv) => lv.status === "pending");
  const mine = waiting.filter((lv) => lv.can_decide).length;
  // The longest-standing request still waiting, off the rows already loaded.
  const oldest = waiting.reduce<StudentLeave | null>(
    (o, lv) => (!o || lv.created_at < o.created_at ? lv : o),
    null
  );

  return (
    <div className="space-y-[18px]">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {/* What the queue looks like, counted off the requests already
          loaded — so it describes what the filter is showing. */}
      <StatStrip
        stats={[
          {
            label: "Waiting on a decision",
            value: waiting.length,
            note: "Among the requests shown",
            icon: Inbox,
          },
          {
            label: "Yours to decide",
            value: mine,
            note: "The rest belong to another class teacher",
            icon: Gavel,
          },
          {
            label: "Longest wait",
            value: oldest ? `${daysWaiting(oldest.created_at)} days` : "—",
            note: oldest ? `${oldest.student_name} · ${oldest.section_label}` : "Nothing waiting",
            icon: Hourglass,
          },
        ]}
      />

      <FilterBar>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={filterSelect}
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </FilterBar>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Leave requests</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {STATUS_LABEL[status] ?? "Every status"} · approving or rejecting sends the
              parent a notice either way
            </p>
          </div>
        </CardHeader>
        <Table head={["Student", "Dates", "Type", "Reason", "Status", ""]} empty={items.length === 0 && "Nothing here."}>
          {items.map((lv) => (
            <tr key={lv.id}>
              <td className={tdStrong}>
                {lv.student_name}
                <div className="text-xs font-normal text-ink-subtle">{lv.section_label}</div>
              </td>
              <td className={td}>
                {lv.from_date}
                {lv.to_date !== lv.from_date && ` → ${lv.to_date}`}
                <div className="text-xs text-ink-subtle">
                  {lv.days} day{lv.days === 1 ? "" : "s"}
                </div>
              </td>
              <td className={td}>{humanize(lv.kind)}</td>
              <td className={td}>
                <div className="max-w-xs whitespace-pre-line">{lv.reason}</div>
                {lv.applied_by_name && <div className="text-xs text-ink-subtle">by {lv.applied_by_name}</div>}
              </td>
              <td className={td}>
                <Badge tone={leaveTone[lv.status]}>{lv.status}</Badge>
                {lv.decided_by_name && <div className="text-xs text-ink-subtle">{lv.decided_by_name}</div>}
                {lv.decision_note && <div className="text-xs text-ink-subtle">{lv.decision_note}</div>}
              </td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                {lv.can_decide && (
                  <>
                    <Button size="sm" onClick={() => decide(lv, true)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => decide(lv, false)}>
                      Reject
                    </Button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`Showing ${items.length} request(s)`}
          right={mine ? `${mine} waiting on you` : "Nothing waiting on you"}
        />
      </Card>
    </div>
  );
}
