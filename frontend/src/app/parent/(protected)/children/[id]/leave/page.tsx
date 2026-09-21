"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { leaveTone, type StudentLeave } from "@/components/cover/StudentLeaves";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PanelFooter } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

const KINDS = [
  ["sick", "Sick"],
  ["family", "Family"],
  ["travel", "Travel"],
  ["religious", "Religious / festival"],
  ["other", "Other"],
];

export default function ChildLeavePage() {
  const { id } = useParams<{ id: string }>();
  const base = `/api/v1/parent/me/children/${id}/leaves`;
  const today = new Date().toISOString().slice(0, 10);
  const [items, setItems] = useState<StudentLeave[]>([]);
  const [f, setF] = useState({ kind: "sick", from_date: today, to_date: today, reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api
      .get<StudentLeave[]>(base)
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post(base, f);
      setNotice("Sent to the class teacher. You'll get a notice when it's decided.");
      setError(null);
      setF({ ...f, reason: "" });
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function cancel(lv: StudentLeave) {
    if (!window.confirm("Cancel this leave request?")) return;
    try {
      await api.post(`${base}/${lv.id}/cancel`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  const pending = items.filter((lv) => lv.status === "pending");

  return (
    <div className="space-y-[18px]">
      <Link href={`/parent/children/${id}`} className="text-sm text-brand-700 hover:underline">
        ← Back
      </Link>
      <PageHeader
        title="Leave"
        subtitle="Ask the class teacher for a day off, and see what has already been decided."
      />
      {error && <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>}
      {notice && <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Apply for leave</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              The class teacher decides; you will get a notice either way.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm text-ink-muted">
              Type
              <select className="mt-1 w-full min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                {KINDS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <Input label="From *" type="date" value={f.from_date} onChange={(e) => setF({ ...f, from_date: e.target.value, to_date: e.target.value > f.to_date ? e.target.value : f.to_date })} required />
            <Input label="To *" type="date" min={f.from_date} value={f.to_date} onChange={(e) => setF({ ...f, to_date: e.target.value })} required />
            <div className="sm:col-span-3">
              <Input label="Reason *" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required minLength={3} />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit">Send request</Button>
            </div>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Requests</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Newest first · {pending.length} waiting on a decision
            </p>
          </div>
        </CardHeader>
        <div className="divide-y divide-surface-border border-t border-surface-border">
          {items.map((lv) => (
            <div key={lv.id} className="flex flex-wrap items-center gap-3 px-[22px] py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">
                    {lv.from_date}
                    {lv.to_date !== lv.from_date && ` → ${lv.to_date}`}
                  </span>
                  <Badge tone={leaveTone[lv.status]}>{lv.status}</Badge>
                  <span className="text-sm text-ink-muted">
                    {lv.days} day{lv.days === 1 ? "" : "s"} · {lv.kind}
                  </span>
                </div>
                <div className="text-sm text-ink-muted">{lv.reason}</div>
                {lv.decision_note && (
                  <div className="text-xs text-ink-muted">
                    {lv.decided_by_name}: {lv.decision_note}
                  </div>
                )}
              </div>
              {(lv.status === "pending" || (lv.status === "approved" && lv.from_date > today)) && (
                <Button size="sm" variant="ghost" onClick={() => cancel(lv)}>
                  Cancel
                </Button>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <div className="px-[22px] py-10 text-center text-[13px] text-ink-muted">
              No leave has been asked for yet.
            </div>
          )}
        </div>
        <PanelFooter
          left={`${items.length} request(s)`}
          right={pending.length ? `${pending.length} waiting` : "Nothing waiting"}
        />
      </Card>
    </div>
  );
}
