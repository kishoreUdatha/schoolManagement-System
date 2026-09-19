"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Select, Table, humanize, td, tdStrong } from "@/components/ui/Field";
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

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      <div className="w-48">
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>
      <Card>
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
      </Card>
    </div>
  );
}
