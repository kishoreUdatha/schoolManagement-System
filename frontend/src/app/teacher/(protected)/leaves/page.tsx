"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { MyLeaveBalances } from "@/components/hr/MyLeaveBalances";
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
  const [editing, setEditing] = useState<Leave | null>(null);

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

      <MyLeaveBalances />

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
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(l)}>
                      Change
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => cancel(l)}>
                      Cancel
                    </Button>
                  </div>
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
      {editing && (
        <ApplyModal
          existing={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            setNotice("Leave updated.");
            load();
          }}
        />
      )}
    </div>
  );
}

function ApplyModal({
  existing,
  onClose,
  onDone,
}: {
  existing?: Leave;
  onClose: () => void;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<LeaveKind>(existing?.kind ?? "casual");
  const [types, setTypes] = useState<{ id: number; name: string; kind: LeaveKind }[]>([]);
  const [typeId, setTypeId] = useState("");
  const [fromDate, setFromDate] = useState(existing?.from_date ?? todayIso());
  const [toDate, setToDate] = useState(existing?.to_date ?? todayIso());
  const [reason, setReason] = useState(existing?.reason ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        leave_type_id: typeId ? Number(typeId) : null,
        from_date: fromDate,
        to_date: toDate,
        reason: reason.trim() || null,
      };
      if (existing) {
        await api.patch(`/api/v1/staff/leaves/${existing.id}`, body);
      } else {
        await api.post("/api/v1/staff/leaves", { ...body, kind });
      }
      onDone();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    api
      .get<{ id: number; name: string; kind: LeaveKind }[]>("/api/v1/staff/leaves/types")
      .then((r) => {
        setTypes(r.data);
        const mine = existing ? r.data.find((t) => t.kind === existing.kind) : undefined;
        const pick = mine ?? r.data[0];
        if (pick) {
          setTypeId(String(pick.id));
          setKind(pick.kind);
        }
      })
      .catch(() => setTypes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal open onClose={onClose} title={existing ? "Change my leave" : "Apply for leave"}>
      <form onSubmit={submit} className="space-y-4">
        {types.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink-muted">Leave type</span>
            <select
              value={typeId}
              onChange={(e) => {
                setTypeId(e.target.value);
                const t = types.find((x) => String(x.id) === e.target.value);
                if (t) setKind(t.kind);
              }}
              className="rounded-lg border border-surface-border bg-surface-subtle px-3 py-2 text-sm text-ink"
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={types.length > 0 ? "hidden" : "flex flex-col gap-1"}>
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
            {existing ? "Save" : "Apply"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
