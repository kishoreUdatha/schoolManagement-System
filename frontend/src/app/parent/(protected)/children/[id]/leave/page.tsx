"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { leaveTone, type StudentLeave } from "@/components/cover/StudentLeaves";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
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

  return (
    <div className="space-y-4">
      <Link href={`/parent/children/${id}`} className="text-sm text-brand-700 hover:underline">
        ← Back
      </Link>
      <h1 className="text-2xl font-bold text-slate-900">Leave</h1>
      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      {notice && <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}
      <Card>
        <CardHeader>
          <CardTitle>Apply for leave</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm text-slate-700">
              Type
              <select className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
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
      {items.map((lv) => (
        <Card key={lv.id}>
          <CardBody className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">
                  {lv.from_date}
                  {lv.to_date !== lv.from_date && ` → ${lv.to_date}`}
                </span>
                <Badge tone={leaveTone[lv.status]}>{lv.status}</Badge>
                <span className="text-sm text-slate-500">
                  {lv.days} day{lv.days === 1 ? "" : "s"} · {lv.kind}
                </span>
              </div>
              <div className="text-sm text-slate-600">{lv.reason}</div>
              {lv.decision_note && (
                <div className="text-xs text-slate-500">
                  {lv.decided_by_name}: {lv.decision_note}
                </div>
              )}
            </div>
            {(lv.status === "pending" || (lv.status === "approved" && lv.from_date > today)) && (
              <Button size="sm" variant="ghost" onClick={() => cancel(lv)}>
                Cancel
              </Button>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
