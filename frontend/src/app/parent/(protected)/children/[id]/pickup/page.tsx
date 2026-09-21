"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

type Pass = {
  id: number;
  leave_on: string;
  leave_time: string | null;
  reason: string;
  pickup_name: string;
  pickup_relation: string | null;
  code: string | null;
  status: "requested" | "approved" | "rejected" | "departed" | "cancelled";
  decision_note: string | null;
  departed_at: string | null;
};

const tone = { requested: "amber", approved: "emerald", rejected: "rose", departed: "neutral", cancelled: "neutral" } as const;

export default function EarlyPickupPage() {
  const { id } = useParams<{ id: string }>();
  const base = `/api/v1/parent/me/children/${id}/gate-passes`;
  const [items, setItems] = useState<Pass[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    leave_on: new Date().toISOString().slice(0, 10),
    leave_time: "",
    reason: "",
    pickup_name: "",
    pickup_relation: "",
    pickup_phone: "",
  });

  const load = () =>
    api
      .get<Pass[]>(base)
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n = (v: string) => (v.trim() ? v.trim() : null);
    try {
      await api.post(base, {
        leave_on: form.leave_on,
        leave_time: n(form.leave_time),
        reason: form.reason,
        pickup_name: form.pickup_name,
        pickup_relation: n(form.pickup_relation),
        pickup_phone: n(form.pickup_phone),
      });
      setNotice("Request sent. You'll get a pickup code here once the school approves it.");
      setForm({ ...form, reason: "", leave_time: "" });
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function cancel(p: Pass) {
    try {
      await api.post(`${base}/${p.id}/cancel`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-4">
      <Link href={`/parent/children/${id}`} className="text-sm text-brand-700 hover:underline">
        ← Back
      </Link>
      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Early pickup</h1>
      {error && <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>}
      {notice && <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>}

      {items
        .filter((p) => p.status === "approved")
        .map((p) => (
          <Card key={p.id} className="border-success p-5 text-center">
            <div className="text-sm text-ink-muted">
              Pickup code for {p.leave_on}
              {p.leave_time && ` at ${p.leave_time}`} · {p.pickup_name}
            </div>
            <div className="mt-1 font-mono text-4xl font-bold tracking-widest text-ink">{p.code}</div>
            <div className="mt-1 text-xs text-ink-muted">Show this at the school gate.</div>
          </Card>
        ))}

      <Card>
        <CardHeader>
          <CardTitle>Request early pickup</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
            <Input label="Date *" type="date" value={form.leave_on} onChange={set("leave_on")} required />
            <Input label="Time" type="time" value={form.leave_time} onChange={set("leave_time")} />
            <Input label="Who will collect *" value={form.pickup_name} onChange={set("pickup_name")} required />
            <Input label="Relation" value={form.pickup_relation} onChange={set("pickup_relation")} />
            <Input label="Their phone" value={form.pickup_phone} onChange={set("pickup_phone")} />
            <Input label="Reason *" value={form.reason} onChange={set("reason")} required minLength={3} />
            <div className="sm:col-span-3">
              <Button type="submit">Send request</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent requests</CardTitle>
        </CardHeader>
        <ul className="divide-y divide-surface-border text-sm">
          {items.length === 0 && <li className="px-4 py-3 text-ink-muted">None yet.</li>}
          {items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <span className="font-medium text-ink">
                  {p.leave_on} {p.leave_time}
                </span>{" "}
                <Badge tone={tone[p.status]}>{p.status}</Badge>
                <div className="text-xs text-ink-muted">
                  {p.pickup_name} · {p.reason}
                  {p.decision_note && ` · ${p.decision_note}`}
                  {p.departed_at && ` · left at ${new Date(p.departed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                </div>
              </div>
              {(p.status === "requested" || p.status === "approved") && (
                <Button size="sm" variant="ghost" onClick={() => cancel(p)}>
                  Cancel
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
