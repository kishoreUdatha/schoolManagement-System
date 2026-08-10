"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type LeaveKind = "casual" | "sick" | "earned" | "unpaid" | "other";
type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

type Leave = {
  id: number;
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function TeacherLeavesPage() {
  const [items, setItems] = useState<Leave[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openApply, setOpenApply] = useState(false);

  async function load() {
    try {
      const { data } = await api.get<Leave[]>("/api/v1/staff/leaves");
      setItems(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function cancel(l: Leave) {
    if (!window.confirm(`Cancel leave ${l.from_date} – ${l.to_date}?`)) return;
    try {
      await api.post(`/api/v1/staff/leaves/${l.id}/cancel`);
      setNotice("Leave cancelled.");
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">My leaves</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Apply for leave; the school admin or principal will review.
          </p>
        </div>
        <Button onClick={() => setOpenApply(true)}>Apply for leave</Button>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {items === null ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : items.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-muted">
              You haven&apos;t applied for any leave yet.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((l) => (
            <Card key={l.id}>
              <CardHeader>
                <CardTitle>
                  {l.from_date} → {l.to_date}{" "}
                  <span className="text-xs text-ink-subtle">
                    ({l.days} day{l.days === 1 ? "" : "s"})
                  </span>{" "}
                  <Badge tone={statusTone(l.status)} className="ml-2">
                    {l.status}
                  </Badge>{" "}
                  <Badge tone="brand" className="ml-1">
                    {l.kind}
                  </Badge>
                </CardTitle>
                {l.status === "pending" && (
                  <Button size="sm" variant="secondary" onClick={() => cancel(l)}>
                    Cancel
                  </Button>
                )}
              </CardHeader>
              <CardBody>
                {l.reason && (
                  <p className="whitespace-pre-line text-sm text-ink">{l.reason}</p>
                )}
                {l.decided_at && (
                  <div className="mt-2 border-t border-surface-border pt-2 text-xs text-ink-muted">
                    <div>
                      Decided by {l.decided_by_name ?? "—"} on{" "}
                      {new Date(l.decided_at).toLocaleString()}
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

      {openApply && (
        <ApplyModal
          onClose={() => setOpenApply(false)}
          onDone={() => {
            setOpenApply(false);
            setNotice("Leave applied.");
            load();
          }}
        />
      )}
    </div>
  );
}

function ApplyModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<LeaveKind>("casual");
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/v1/staff/leaves", {
        kind,
        from_date: fromDate,
        to_date: toDate,
        reason: reason.trim() || null,
      });
      onDone();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Apply for leave">
      <form onSubmit={submit} className="space-y-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink-muted">Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LeaveKind)}
            className="rounded-lg border border-surface-border bg-surface-subtle px-3 py-2 text-sm text-ink"
          >
            <option value="casual">Casual</option>
            <option value="sick">Sick</option>
            <option value="earned">Earned</option>
            <option value="unpaid">Unpaid</option>
            <option value="other">Other</option>
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="From *"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            required
          />
          <Input
            label="To *"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            min={fromDate}
            required
          />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink-muted">Reason</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Brief reason for the request"
            className="rounded-lg border border-surface-border bg-surface-subtle px-3 py-2 text-sm text-ink"
          />
        </label>
        {error && (
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Apply
          </Button>
        </div>
      </form>
    </Modal>
  );
}
