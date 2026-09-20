"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Send } from "lucide-react";

import { BreakdownChart, ChartCard } from "@/components/charts/Charts";
import { SERIES, VERDICT } from "@/components/charts/theme";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  WarnBox,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { dateTime } from "@/lib/dates";

type Bucket = { label: string; amount: string };
type Defaulter = {
  student_id: number;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  owed: string;
  items: number;
  oldest_days: number;
};
type Dues = {
  as_of: string;
  total: string;
  students_owing: number;
  buckets: Bucket[];
  defaulters: Defaulter[];
};
type ReminderLog = {
  id: number;
  student_fee_id: number;
  kind: string;
  send_date: string;
  sent_at: string | null;
};

const BUCKET_TONE: Record<string, string> = {
  "Not yet due": SERIES[7],
  "1-30 days": VERDICT.good,
  "31-60 days": VERDICT.fair,
  "61-90 days": SERIES[6],
  "Over 90 days": VERDICT.poor,
};

function ageTone(days: number): "emerald" | "amber" | "rose" | "neutral" {
  if (days <= 0) return "neutral";
  if (days <= 30) return "emerald";
  if (days <= 90) return "amber";
  return "rose";
}

/** Money owed, and the one thing you can do about it from here.
 *
 *  The buckets come from the same calculation the reports screen uses. What
 *  this adds is sending the reminder and keeping the record that it went —
 *  a list you can only look at gets looked at and nothing else.
 */
export default function OutstandingDuesPage() {
  const [data, setData] = useState<Dues | null>(null);
  const [sent, setSent] = useState<ReminderLog[]>([]);
  const [bucket, setBucket] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api
      .get<Dues>("/api/v1/school/analytics/dues-ageing")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
    api
      .get<ReminderLog[]>("/api/v1/school/fees/reminders")
      .then((r) => setSent(r.data))
      .catch(() => setSent([]));
  };

  useEffect(load, []);

  const runReminders = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await api.post<{ sent?: number; skipped?: number }>(
        "/api/v1/school/fees/reminders/run"
      );
      const n = r.data?.sent ?? 0;
      setNote(
        n
          ? `${n} reminder(s) sent. They appear in each family's notices.`
          : "Nothing was due a reminder today — the run is skipped rather than repeated."
      );
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const buckets = (data?.buckets ?? []).map((b) => ({
    label: b.label,
    amount: Number(b.amount),
  }));
  const total = Number(data?.total ?? 0);
  const old = buckets.find((b) => b.label === "Over 90 days")?.amount ?? 0;
  const notYetDue = buckets.find((b) => b.label === "Not yet due")?.amount ?? 0;

  const shown = (data?.defaulters ?? []).filter((d) => {
    if (!bucket) return true;
    if (bucket === "over90") return d.oldest_days > 90;
    if (bucket === "31to90") return d.oldest_days > 30 && d.oldest_days <= 90;
    if (bucket === "1to30") return d.oldest_days > 0 && d.oldest_days <= 30;
    return d.oldest_days <= 0;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outstanding dues"
        subtitle="Unpaid fees by how long they have been overdue, and who to chase."
        actions={
          <Button onClick={runReminders} loading={busy}>
            <Send className="mr-1.5 h-4 w-4" />
            Send today&apos;s reminders
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {note && <NoticeBox>{note}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Outstanding" value={data ? inr(data.total) : "—"} accent="amber" />
        <StatCard
          label="Overdue"
          value={data ? inr(total - notYetDue) : "—"}
          hint={data ? `${inr(notYetDue)} not yet due` : undefined}
          accent="amber"
        />
        <StatCard
          label="Over 90 days"
          value={data ? inr(old) : "—"}
          accent={old > 0 ? "rose" : "emerald"}
        />
        <StatCard label="Families owing" value={data?.students_owing ?? "—"} />
      </div>

      {old > 0 && (
        <WarnBox>
          {inr(old)} has been outstanding for more than ninety days. Money that old
          rarely arrives after another reminder — it usually needs a conversation.
        </WarnBox>
      )}

      <ChartCard
        title="How old the money is"
        subtitle="Every unpaid bill, bucketed by days past its due date."
        empty={total === 0 && "Nothing is outstanding."}
      >
        <BreakdownChart
          data={buckets}
          x="label"
          series={[{ key: "amount", name: "Outstanding" }]}
          colorBy={(row) => BUCKET_TONE[String(row.label)] ?? VERDICT.fair}
          xFormatter={(v) =>
            v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${Math.round(v / 1000)}k`
          }
        />
      </ChartCard>

      <Card>
        <CardHeader>
          <CardTitle>Who owes it</CardTitle>
          <Select
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            aria-label="Filter by age"
          >
            <option value="">Every family</option>
            <option value="notdue">Not yet due</option>
            <option value="1to30">1–30 days</option>
            <option value="31to90">31–90 days</option>
            <option value="over90">Over 90 days</option>
          </Select>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Admission no", "Student", "Owed", "Bills", "Oldest", ""]}
            empty={shown.length === 0 && "Nobody here owes anything."}
          >
            {shown.map((d) => (
              <tr key={d.student_id}>
                <td className={td}>{d.admission_no}</td>
                <td className={tdStrong}>
                  {d.student_name}
                  {d.section_label && (
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      {d.section_label}
                    </span>
                  )}
                </td>
                <td className={tdStrong}>{inr(d.owed)}</td>
                <td className={td}>{d.items}</td>
                <td className={td}>
                  {d.oldest_days > 0 ? (
                    <Badge tone={ageTone(d.oldest_days)}>{d.oldest_days} days</Badge>
                  ) : (
                    <span className="text-ink-subtle">Not yet due</span>
                  )}
                </td>
                <td className={td}>
                  <Link
                    href={`/school/fees/ledger/${d.student_id}`}
                    className="font-bold text-brand-600 hover:underline"
                  >
                    Ledger
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminders already sent</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Sent", "Kind", "Charge"]}
            empty={sent.length === 0 && "No reminders have gone out yet."}
          >
            {sent.slice(0, 25).map((r) => (
              <tr key={r.id}>
                <td className={td}>{dateTime(r.send_date)}</td>
                <td className={tdStrong}>{r.kind.replace(/_/g, " ")}</td>
                <td className={td}>#{r.student_fee_id}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <p className="text-[12px] text-ink-subtle">
        A reminder is logged against the charge and the day, so running this
        twice in one day sends nothing a second time.
      </p>
    </div>
  );
}
