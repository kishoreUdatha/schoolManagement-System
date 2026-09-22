"use client";

/*
 * Requests parents send from the app that a school job approves:
 *   link a child / change contact details  → school office (SCR-074, SCR-071)
 *   transport change                       → transport office (SCR-193)
 *   library renewal                        → library desk (SCR-204)
 * GET {list}?status=… and POST {list}/{id}/decide {approve, note}. Approving
 * applies the change (links the child, updates the contact, moves the
 * transport assignment, renews the loan).
 */

import { useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";

import { askText } from "@/lib/dialog";
export type SchoolParentRequest = {
  id: number;
  kind: "link_child" | "contact_change" | "transport_change" | "library_renewal";
  status: "pending" | "approved" | "rejected" | "cancelled";
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  student_name: string | null;
  section_label: string | null;
  summary: string;
  reason: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  matched_student_id: number | null;
  matched_student_name: string | null;
};

const KIND: Record<SchoolParentRequest["kind"], string> = {
  link_child: "Link a child",
  contact_change: "Contact details",
  transport_change: "Transport change",
  library_renewal: "Library renewal",
};
const STATUS: Record<SchoolParentRequest["status"], string> = { pending: "Pending", approved: "Approved", rejected: "Declined", cancelled: "Withdrawn" };

export function ParentRequestsPanel({
  title,
  sub,
  list,
  kind,
  onDecided,
}: {
  title: string;
  sub: string;
  /** e.g. /api/v1/school/parent-services/requests */
  list: string;
  /** Only this kind, where the list serves several. */
  kind?: SchoolParentRequest["kind"];
  onDecided?: () => void;
}) {
  const [status, setStatus] = useState<"pending" | "">("pending");
  const reqs = useApi<SchoolParentRequest[]>(list, { status: status || undefined, kind });
  const [busy, setBusy] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function decide(r: SchoolParentRequest, approve: boolean) {
    const note = approve ? "" : (await askText("Reason for declining (the parent sees this):", ""));
    if (note === null) return;
    setBusy(r.id);
    setFailed(null);
    try {
      await api.post(`${list}/${r.id}/decide`, { approve, note: note || null });
      notify(approve ? "Approved." : "Declined.");
      reqs.reload();
      onDecided?.();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const items = reqs.data ?? [];
  const rows: Row[] = items.map((r) => [
    { name: r.parent_name ?? "Parent", sub: [r.parent_phone, r.parent_email].filter(Boolean).join(" · ") || undefined },
    { name: r.student_name ?? (r.kind === "link_child" ? (r.matched_student_name ? `Matches ${r.matched_student_name}` : "No matching student") : "—"), sub: r.section_label ?? undefined },
    { name: r.summary, sub: [kind ? null : KIND[r.kind], r.reason].filter(Boolean).join(" · ") || undefined },
    dateTime(r.created_at),
    { name: STATUS[r.status], sub: r.decided_at ? `${r.decided_by_name ?? ""} · ${date(r.decided_at)}${r.decision_note ? ` · ${r.decision_note}` : ""}` : undefined },
  ]);

  return (
    <Panel
      title={title}
      sub={sub}
      flush
      action={
        <select value={status} onChange={(e) => setStatus(e.target.value as "pending" | "")} aria-label="Show">
          <option value="pending">Pending</option>
          <option value="">All requests</option>
        </select>
      }
    >
      <ErrorNote>{failed ?? reqs.error}</ErrorNote>
      {reqs.loading && !reqs.data ? (
        <Loading what="Loading requests…" />
      ) : (
        <DataTable
          columns={["Parent", "Student", "Request", "Sent", "Status"]}
          rows={rows}
          selectable={false}
          empty={status ? "No requests waiting." : "No requests from parents yet."}
          actions={(i) => {
            const r = items[i];
            if (r.status !== "pending") return <Badge>{STATUS[r.status]}</Badge>;
            const noMatch = r.kind === "link_child" && !r.matched_student_id;
            return (
              <>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null || noMatch}
                  title={noMatch ? "No student has this admission number and date of birth. Check with the parent, or link the child by hand." : undefined}
                  onClick={() => decide(r, true)}
                >
                  Approve
                </button>
                <button type="button" className="btn" disabled={busy !== null} onClick={() => decide(r, false)}>
                  Decline
                </button>
              </>
            );
          }}
        />
      )}
    </Panel>
  );
}
