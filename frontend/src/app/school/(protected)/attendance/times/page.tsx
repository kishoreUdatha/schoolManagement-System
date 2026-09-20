"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { StudentPicker, type PickedStudent } from "@/components/StudentPicker";
import { api, apiError } from "@/lib/api";
import { hhmm, shortDate, toIso } from "@/lib/dates";

type Row = {
  student_id: number;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  date: string;
  status: string;
  arrived_at: string | null;
  left_at: string | null;
  remark: string | null;
  times_in_window: number;
};
type Window = { from_date: string; to_date: string; rows: Row[]; count: number };

/** How often a repeated lateness stops being weather.
 *
 *  One late morning is a bus. Several is a pattern somebody should mention to
 *  a parent, which is why the count over the window is on every row rather
 *  than left for whoever is reading to tally up.
 */
function repeatTone(n: number): "neutral" | "amber" | "rose" {
  if (n >= 5) return "rose";
  if (n >= 3) return "amber";
  return "neutral";
}

export default function LateAndEarlyPage() {
  const start = new Date();
  start.setDate(start.getDate() - 30);

  const [from, setFrom] = useState(toIso(start));
  const [to, setTo] = useState(toIso(new Date()));
  const [data, setData] = useState<Window | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<PickedStudent | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    student_id: "",
    date: toIso(new Date()),
    arrived_at: "",
    left_at: "",
    remark: "",
  });

  const load = useCallback(() => {
    api
      .get<Window>("/api/v1/school/attendance-ops/times", { params: { from, to } })
      .then((r) => {
        setData(r.data);
        setError(null);
      })
      .catch((e) => setError(apiError(e)));
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const record = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.put("/api/v1/school/attendance-ops/times", {
        student_id: Number(form.student_id),
        date: form.date,
        arrived_at: form.arrived_at || null,
        left_at: form.left_at || null,
        remark: form.remark || null,
      });
      setSaved("Recorded on that day's register entry.");
      setOpen(false);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const rows = data?.rows ?? [];
  const late = rows.filter((r) => r.arrived_at).length;
  const early = rows.filter((r) => r.left_at).length;
  const repeat = new Set(
    rows.filter((r) => r.times_in_window >= 3).map((r) => r.student_id)
  ).size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Late in, away early"
        subtitle="Arrivals and departures recorded against the day's own register entry."
        actions={<Button onClick={() => setOpen(true)}>Record a time</Button>}
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Input
            label="From"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button variant="secondary" onClick={load}>
            Apply
          </Button>
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Entries" value={data?.count ?? "—"} />
        <StatCard label="Late arrivals" value={late} />
        <StatCard label="Left early" value={early} />
        <StatCard
          label="Three or more times"
          value={repeat}
          accent={repeat ? "amber" : "emerald"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Over the window</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Date", "Student", "Day", "Arrived", "Left", "Times", "Remark"]}
            empty={rows.length === 0 && "No late arrivals or early departures recorded yet."}
          >
            {rows.map((r, i) => (
              <tr key={`${r.student_id}-${r.date}-${i}`}>
                <td className={td}>{shortDate(r.date)}</td>
                <td className={tdStrong}>
                  {r.student_name}
                  <span className="block text-[11px] font-normal text-ink-subtle">
                    {r.admission_no}
                    {r.section_label ? ` · ${r.section_label}` : ""}
                  </span>
                </td>
                <td className={td}>{humanize(r.status)}</td>
                <td className={td}>{r.arrived_at ? hhmm(r.arrived_at) : "—"}</td>
                <td className={td}>{r.left_at ? hhmm(r.left_at) : "—"}</td>
                <td className={td}>
                  {r.times_in_window > 1 ? (
                    <Badge tone={repeatTone(r.times_in_window)}>
                      {r.times_in_window}× in this window
                    </Badge>
                  ) : (
                    <span className="text-ink-subtle">Once</span>
                  )}
                </td>
                <td className={td}>{r.remark ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Record an arrival or departure">
        <div className="space-y-4">
          <StudentPicker
            value={picked}
            onChange={(s) => {
              setPicked(s);
              setForm({ ...form, student_id: s ? String(s.id) : "" });
            }}
          />
          <p className="text-[12px] text-ink-subtle">The child must already have attendance marked for that day.</p>
          <Input
            label="Date"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <div className="flex flex-wrap gap-3">
            <Input
              label="Arrived at"
              type="time"
              value={form.arrived_at}
              onChange={(e) => setForm({ ...form, arrived_at: e.target.value })}
            />
            <Input
              label="Left at"
              type="time"
              value={form.left_at}
              onChange={(e) => setForm({ ...form, left_at: e.target.value })}
            />
          </div>
          <Input
            label="Remark"
            value={form.remark}
            onChange={(e) => setForm({ ...form, remark: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={record}
              loading={busy}
              disabled={!form.student_id || (!form.arrived_at && !form.left_at)}
            >
              Record
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
