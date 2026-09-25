"use client";

import { useState } from "react";
import { useTeacherApp } from "@/components/teacherapp/TeacherShell";
import { api, errorText } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { dayLabel, PmEmpty, PmError, PmLoading } from "./parts";

export type StudentLeave = {
  id: number;
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
  decision_note: string | null;
  can_decide: boolean;
  attachments: { id: number; file_name: string }[];
};

export const STUDENT_LEAVES = "/api/v1/school/student-leaves";

const KIND: Record<string, string> = { sick: "Medical", family: "Family reason", travel: "Travel", religious: "Religious / festival", other: "Other" };
const STATUS: Record<string, [string, string]> = {
  pending: ["Waiting for you", "status amber"],
  approved: ["Approved", "status"],
  rejected: ["Not approved", "status red"],
  cancelled: ["Withdrawn", "status blue"],
};

/** TM-017. Leave parents asked for, for the class teacher's sections: approve or turn down from the phone. */
export function TeacherLeaveRequests() {
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const leaves = useApi<StudentLeave[]>(STUDENT_LEAVES, tab === "pending" ? { status: "pending" } : {});
  const list = (leaves.data ?? []).filter((l) => tab === "all" || l.can_decide);

  return (
    <>
      <div className="chip-row">
        <button className={tab === "pending" ? "on" : ""} onClick={() => setTab("pending")}>
          To decide
        </button>
        <button className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>
          All requests
        </button>
      </div>
      <PmError>{leaves.error}</PmError>
      {leaves.loading && !leaves.data ? <PmLoading /> : null}
      {leaves.data && !list.length ? (
        <PmEmpty title={tab === "pending" ? "Nothing to decide" : "No leave requests"}>Requests parents send for your class appear here.</PmEmpty>
      ) : null}
      {list.map((l) => (
        <LeaveCard key={l.id} l={l} onDone={leaves.reload} />
      ))}
    </>
  );
}

function LeaveCard({ l, onDone }: { l: StudentLeave; onDone: () => void }) {
  const { notify } = useTeacherApp();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, cls] = STATUS[l.status] ?? [l.status, "status blue"];
  const range = l.from_date === l.to_date ? dayLabel(l.from_date) : `${dayLabel(l.from_date)} – ${dayLabel(l.to_date)}`;

  async function decide(approve: boolean) {
    if (!approve && !note.trim()) {
      setError("Tell the parent why, so they know what to do next.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`${STUDENT_LEAVES}/${l.id}/decide`, { approve, note: note.trim() || null });
      notify(approve ? `Leave approved for ${l.student_name}.` : `Leave not approved for ${l.student_name}.`);
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ marginBottom: 10 }}>
      <div className="between">
        <strong>{l.student_name}</strong>
        <span className={cls}>{label}</span>
      </div>
      <p className="muted" style={{ margin: "4px 0" }}>{`${l.section_label} · ${KIND[l.kind] ?? l.kind} · ${range} (${l.days} day${l.days === 1 ? "" : "s"})`}</p>
      <p style={{ margin: "6px 0", whiteSpace: "pre-wrap" }}>{l.reason}</p>
      {l.applied_by_name ? <p className="micro">{`Asked by ${l.applied_by_name}`}</p> : null}
      {l.attachments.map((f) => (
        <button key={f.id} className="text-button blue-text" onClick={() => api.open(`${STUDENT_LEAVES}/${l.id}/files/${f.id}`)}>
          {`📎 ${f.file_name}`}
        </button>
      ))}
      {l.decision_note ? <p className="micro">{`${l.decided_by_name ?? "School"}: ${l.decision_note}`}</p> : null}
      {l.status === "pending" && l.can_decide ? (
        <>
          <label className="field">
            Note for the parent
            <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional when approving; needed when not approving" />
          </label>
          {error ? <p className="micro bad" role="alert">{error}</p> : null}
          <button className="action" disabled={busy} onClick={() => decide(true)}>
            {busy ? "Saving…" : "Approve leave"}
          </button>
          <button className="action secondary" disabled={busy} onClick={() => decide(false)}>
            Don&apos;t approve
          </button>
        </>
      ) : null}
    </div>
  );
}
