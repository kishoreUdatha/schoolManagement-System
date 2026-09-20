"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Staff leaves</h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Review and decide leave requests from teachers, principals, accountants, and non-teaching staff.
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
        <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-[#E9F7F0] px-4 py-3 text-[13px] font-medium text-[#07845E] dark:bg-emerald-500/15 dark:text-emerald-200">
          {notice}
        </div>
      )}

      {items.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-muted">
              {tab === "pending"
                ? "Nothing pending."
                : "No decisions on record."}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((l) => (
            <Card key={l.id}>
              <CardHeader>
                <CardTitle>
                  {l.applicant_name ?? "—"}
                  <span className="ml-2 text-xs font-normal text-ink-subtle">
                    {l.applicant_role}
                  </span>
                  <Badge tone={statusTone(l.status)} className="ml-2">
                    {l.status}
                  </Badge>{" "}
                  <Badge tone="brand">{l.kind}</Badge>
                </CardTitle>
                <div className="text-xs text-ink-muted">
                  {l.from_date} → {l.to_date} · {l.days} day
                  {l.days === 1 ? "" : "s"}
                </div>
              </CardHeader>
              <CardBody>
                {l.reason && (
                  <p className="whitespace-pre-line text-sm text-ink">
                    {l.reason}
                  </p>
                )}
                {l.status === "pending" ? (
                  <div className="mt-3 space-y-2 border-t border-surface-border pt-3">
                    <textarea
                      rows={2}
                      placeholder="Optional decision remark"
                      value={remarkDraft[l.id] ?? ""}
                      onChange={(e) =>
                        setRemarkDraft({ ...remarkDraft, [l.id]: e.target.value })
                      }
                      className="w-full rounded-md border border-surface-border bg-surface-subtle px-2 py-1.5 text-sm text-ink"
                    />
                    <div className="flex gap-2">
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
                  <div className="mt-2 border-t border-surface-border pt-2 text-xs text-ink-muted">
                    <div>
                      Decided by {l.decided_by_name ?? "—"}{" "}
                      {l.decided_at && (
                        <span>
                          on {new Date(l.decided_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    {l.decision_remark && (
                      <p className="mt-1 whitespace-pre-line">
                        “{l.decision_remark}”
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
