"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select, Textarea } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

type ChildHostel = {
  hostel_name: string;
  room_no: string;
  bed_label: string;
  since: string;
  warden_name: string | null;
  warden_phone: string | null;
  curfew: string | null;
  menu_today: Record<string, string>;
  attendance_last_7_days: { date: string; session: string; status: string }[];
};

type Outing = { id: number; kind: string; leave_at: string; return_by: string; reason: string; status: string; decision_note: string | null };

const dt = (iso: string) => new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ChildHostelPage() {
  const { id } = useParams<{ id: string }>();
  const base = `/api/v1/parent/me/children/${id}/hostel`;
  const [data, setData] = useState<ChildHostel | null | undefined>(undefined);
  const [outings, setOutings] = useState<Outing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [f, setF] = useState({ kind: "home_leave", leave_at: "", return_by: "", reason: "", escort_name: "" });
  const [complaint, setComplaint] = useState({ category: "maintenance", description: "" });

  async function load() {
    try {
      const [h, o] = await Promise.all([api.get<ChildHostel | null>(base), api.get<Outing[]>(`${base}/outings`)]);
      setData(h.data);
      setOutings(o.data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function requestLeave(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post(`${base}/outings`, {
        ...f,
        leave_at: new Date(f.leave_at).toISOString(),
        return_by: new Date(f.return_by).toISOString(),
        escort_name: f.escort_name || null,
      });
      setNotice("Request sent to the warden.");
      setF({ ...f, reason: "" });
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function complain(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post(`${base}/complaints`, complaint);
      setNotice("Complaint sent to the warden.");
      setComplaint({ ...complaint, description: "" });
    } catch (err) {
      setError(apiError(err));
    }
  }

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="space-y-4">
      <Link href={`/parent/children/${id}`} className="text-sm text-brand-700 hover:underline">
        ← Back
      </Link>
      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Hostel</h1>
      {error && <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>}
      {notice && <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>}
      {data === null && <Card className="p-6 text-sm text-ink-muted">Your child isn&apos;t staying in the school hostel.</Card>}
      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                {data.hostel_name} · Room {data.room_no}-{data.bed_label}
              </CardTitle>
            </CardHeader>
            <CardBody className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-ink-muted">Warden</div>
                <div className="font-medium">
                  {data.warden_name ?? "—"}{" "}
                  {data.warden_phone && (
                    <a className="text-brand-700 hover:underline" href={`tel:${data.warden_phone}`}>
                      {data.warden_phone}
                    </a>
                  )}
                </div>
              </div>
              <div>
                <div className="text-ink-muted">Curfew</div>
                <div className="font-medium">{data.curfew ?? "—"}</div>
              </div>
              <div>
                <div className="text-ink-muted">Since</div>
                <div className="font-medium">{data.since}</div>
              </div>
            </CardBody>
          </Card>

          {Object.keys(data.menu_today).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Today&apos;s menu</CardTitle>
              </CardHeader>
              <CardBody className="grid gap-2 text-sm sm:grid-cols-4">
                {["breakfast", "lunch", "snacks", "dinner"].map(
                  (m) =>
                    data.menu_today[m] && (
                      <div key={m}>
                        <div className="capitalize text-ink-muted">{m}</div>
                        <div>{data.menu_today[m]}</div>
                      </div>
                    )
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Roll call (last 7 days)</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-wrap gap-2 text-xs">
              {data.attendance_last_7_days.length === 0 && <span className="text-ink-muted">Nothing recorded yet.</span>}
              {data.attendance_last_7_days.map((a) => (
                <Badge key={`${a.date}-${a.session}`} tone={a.status === "absent" ? "rose" : a.status === "on_leave" ? "amber" : "emerald"}>
                  {a.date.slice(5)} {a.session}: {a.status.replace("_", " ")}
                </Badge>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Home leave / outing</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <form onSubmit={requestLeave} className="grid gap-3 sm:grid-cols-3">
                <Select label="Type" value={f.kind} onChange={set("kind")}>
                  <option value="home_leave">Home leave</option>
                  <option value="outing">Outing (same day)</option>
                </Select>
                <Input label="Pick up *" type="datetime-local" value={f.leave_at} onChange={set("leave_at")} required />
                <Input label="Back by *" type="datetime-local" value={f.return_by} onChange={set("return_by")} required />
                <Input label="Who will collect" value={f.escort_name} onChange={set("escort_name")} />
                <div className="sm:col-span-2">
                  <Input label="Reason *" value={f.reason} onChange={set("reason")} required minLength={3} />
                </div>
                <div>
                  <Button type="submit">Send request</Button>
                </div>
              </form>
              <ul className="divide-y divide-surface-border text-sm">
                {outings.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      {dt(o.leave_at)} → {dt(o.return_by)} <Badge>{o.status}</Badge>
                      <div className="text-xs text-ink-muted">
                        {o.reason}
                        {o.decision_note && ` · ${o.decision_note}`}
                      </div>
                    </div>
                    {(o.status === "requested" || o.status === "approved") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          api
                            .post(`${base}/outings/${o.id}/cancel`)
                            .then(load)
                            .catch((e) => setError(apiError(e)))
                        }
                      >
                        Cancel
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Report a problem</CardTitle>
            </CardHeader>
            <CardBody>
              <form onSubmit={complain} className="grid items-end gap-3 sm:grid-cols-4">
                <Select label="About" value={complaint.category} onChange={(e) => setComplaint({ ...complaint, category: e.target.value })}>
                  {["maintenance", "food", "cleanliness", "security", "roommate", "other"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                <div className="sm:col-span-2">
                  <Textarea label="Details" rows={1} value={complaint.description} onChange={(e) => setComplaint({ ...complaint, description: e.target.value })} required minLength={5} />
                </div>
                <Button type="submit">Send</Button>
              </form>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
