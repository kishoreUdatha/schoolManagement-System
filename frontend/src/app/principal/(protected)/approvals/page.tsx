"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type ApprovalKind =
  | "marks_correction"
  | "attendance_edit"
  | "staff_leave"
  | "result_publishing";

type ApprovalStatus = "pending" | "approved" | "rejected";

type Approval = {
  id: number;
  kind: ApprovalKind;
  status: ApprovalStatus;
  requested_by_user_id: number | null;
  requested_by_name: string | null;
  reason: string | null;
  payload: Record<string, unknown>;
  reviewed_by_user_id: number | null;
  reviewed_by_name: string | null;
  decision_remark: string | null;
  decided_at: string | null;
  created_at: string;
};

const kindLabel: Record<ApprovalKind, string> = {
  marks_correction: "Marks correction",
  attendance_edit: "Attendance edit",
  staff_leave: "Staff leave",
  result_publishing: "Result publishing",
};

function statusTone(s: ApprovalStatus) {
  if (s === "approved") return "emerald" as const;
  if (s === "rejected") return "rose" as const;
  return "amber" as const;
}

type Tab = "pending" | "history";

export default function PrincipalApprovalsPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [items, setItems] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<number | null>(null);
  const [remarkDraft, setRemarkDraft] = useState<Record<number, string>>({});

  async function load() {
    try {
      const params: Record<string, string> = {};
      if (tab === "pending") params.status = "pending";
      const { data } = await api.get<Approval[]>(
        "/api/v1/principal/approvals",
        { params }
      );
      setItems(
        tab === "history"
          ? data.filter((a) => a.status !== "pending")
          : data
      );
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function decide(a: Approval, status: "approved" | "rejected") {
    setDeciding(a.id);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/api/v1/principal/approvals/${a.id}/decide`, {
        status,
        decision_remark: remarkDraft[a.id]?.trim() || null,
      });
      setNotice(`Request #${a.id} ${status}.`);
      await load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setDeciding(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Approvals</h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Review marks corrections, attendance edits, leave requests, and
          result publishing.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-md bg-surface-subtle p-1 text-sm">
        {(
          [
            ["pending", "Pending"],
            ["history", "History"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={
              "rounded-md px-3 py-1.5 font-medium transition " +
              (tab === k
                ? "bg-surface-raised text-ink shadow-sm"
                : "text-ink-muted hover:bg-surface-hover")
            }
          >
            {label}
          </button>
        ))}
      </div>

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

      {items.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-muted">
              {tab === "pending"
                ? "Nothing waiting for review."
                : "No decisions recorded yet."}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <CardTitle>
                  <span className="mr-2">{kindLabel[a.kind]}</span>
                  <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  <span className="ml-2 text-xs font-normal text-ink-subtle">
                    #{a.id}
                  </span>
                </CardTitle>
                <div className="text-xs text-ink-muted">
                  {a.requested_by_name && (
                    <>by {a.requested_by_name} · </>
                  )}
                  {new Date(a.created_at).toLocaleString()}
                </div>
              </CardHeader>
              <CardBody>
                {a.reason && (
                  <div className="mb-3">
                    <div className="text-xs text-ink-subtle">Reason</div>
                    <p className="mt-0.5 whitespace-pre-line text-sm text-ink">
                      {a.reason}
                    </p>
                  </div>
                )}
                {Object.keys(a.payload).length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs text-ink-subtle">Payload</div>
                    <pre className="mt-1 max-h-40 overflow-auto rounded-md border border-surface-border bg-surface-subtle p-2 text-xs text-ink">
                      {JSON.stringify(a.payload, null, 2)}
                    </pre>
                  </div>
                )}
                {a.status === "pending" ? (
                  <div className="space-y-2 border-t border-surface-border pt-3">
                    <textarea
                      rows={2}
                      placeholder="Optional decision remark"
                      value={remarkDraft[a.id] ?? ""}
                      onChange={(e) =>
                        setRemarkDraft({
                          ...remarkDraft,
                          [a.id]: e.target.value,
                        })
                      }
                      className="w-full rounded-md border border-surface-border bg-surface-subtle px-2 py-1.5 text-sm text-ink shadow-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        loading={deciding === a.id}
                        onClick={() => decide(a, "approved")}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={deciding === a.id}
                        onClick={() => decide(a, "rejected")}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-surface-border pt-3 text-sm text-ink-muted">
                    <div>
                      <span className="text-xs text-ink-subtle">Decided by</span>{" "}
                      {a.reviewed_by_name ?? "—"}
                      {a.decided_at && (
                        <span className="ml-2 text-xs text-ink-subtle">
                          {new Date(a.decided_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    {a.decision_remark && (
                      <p className="mt-1 whitespace-pre-line">
                        “{a.decision_remark}”
                      </p>
                    )}
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
