"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  Textarea,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { daysLeft, shortDate } from "@/lib/dates";
import { stageTone } from "@/app/school/(protected)/admissions/types";
import type { AdmissionStage } from "@/app/school/(protected)/admissions/types";

type Enquiry = {
  id: number;
  student_name: string;
  applying_for_class: string | null;
  parent_name: string;
  parent_phone: string;
  parent_email: string | null;
  stage: AdmissionStage;
  next_follow_up_date: string | null;
  assigned_to_name: string | null;
};

const base = "/api/v1/school/admissions";
const KINDS = ["call", "visit", "email", "whatsapp", "note"];

/** Buckets, not a filter.
 *
 *  The old screen had a "follow-ups due" checkbox, which answers "is there
 *  anything?" but not "what do I do first". Sorting the same rows into
 *  overdue / today / this week / later turns the list into an order of work.
 */
type Bucket = { key: string; title: string; tone: "rose" | "amber" | "brand" | "neutral"; rows: Enquiry[] };

function bucketOf(iso: string | null): string {
  const d = daysLeft(iso);
  if (d === null) return "none";
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "week";
  return "later";
}

export default function FollowUpsPage() {
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [openOnly, setOpenOnly] = useState(true);
  const [logging, setLogging] = useState<Enquiry | null>(null);
  const [kind, setKind] = useState("call");
  const [note, setNote] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = () =>
    api
      .get<{ items: Enquiry[] }>(`${base}/enquiries`, {
        params: { open_only: openOnly, page_size: 200 },
      })
      .then((r) => setRows(r.data.items))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOnly]);

  const withDate = rows.filter((r) => r.next_follow_up_date);
  const buckets: Bucket[] = [
    { key: "overdue", title: "Overdue", tone: "rose", rows: [] },
    { key: "today", title: "Today", tone: "amber", rows: [] },
    { key: "week", title: "This week", tone: "brand", rows: [] },
    { key: "later", title: "Later", tone: "neutral", rows: [] },
  ];
  for (const r of withDate) {
    const b = buckets.find((x) => x.key === bucketOf(r.next_follow_up_date));
    if (b) b.rows.push(r);
  }
  for (const b of buckets) {
    b.rows.sort((a, z) => (a.next_follow_up_date ?? "").localeCompare(z.next_follow_up_date ?? ""));
  }
  const unscheduled = rows.filter((r) => !r.next_follow_up_date);

  const open = (e: Enquiry) => {
    setLogging(e);
    setKind("call");
    setNote("");
    setNextDate("");
    setError(null);
    setDone(null);
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!logging) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`${base}/enquiries/${logging.id}/activities`, {
        kind,
        note,
        next_follow_up_date: nextDate || null,
      });
      setDone(`Logged against ${logging.student_name}.`);
      setLogging(null);
      load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Follow-ups"
        subtitle="Every enquiry with a date against it, in the order somebody should get to them."
        actions={
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
            />
            Hide enrolled and lost
          </label>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {done && <NoticeBox>{done}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {buckets.map((b) => (
          <StatCard
            key={b.key}
            label={b.title}
            value={b.rows.length}
            accent={b.key === "overdue" && b.rows.length ? "rose" : b.key === "today" && b.rows.length ? "amber" : "brand"}
          />
        ))}
      </div>

      {buckets.map((b) =>
        b.rows.length === 0 ? null : (
          <Card key={b.key}>
            <CardHeader>
              <CardTitle>{b.title}</CardTitle>
              <Badge tone={b.tone}>{b.rows.length}</Badge>
            </CardHeader>
            <CardBody className="p-0">
              <Table head={["Due", "Child", "Parent", "Stage", "Owner", ""]}>
                {b.rows.map((e) => (
                  <tr key={e.id}>
                    <td className={td}>{shortDate(e.next_follow_up_date as string)}</td>
                    <td className={tdStrong}>
                      <Link href={`/school/admissions/${e.id}`} className="hover:underline">
                        {e.student_name}
                      </Link>
                      {e.applying_for_class && (
                        <span className="block text-[11px] font-normal text-ink-subtle">
                          for {e.applying_for_class}
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      {e.parent_name}
                      <span className="block text-[11px] text-ink-subtle">{e.parent_phone}</span>
                    </td>
                    <td className={td}>
                      <Badge tone={stageTone(e.stage)}>{humanize(e.stage)}</Badge>
                    </td>
                    <td className={td}>{e.assigned_to_name ?? "Nobody"}</td>
                    <td className={td}>
                      <Button size="sm" variant="secondary" onClick={() => open(e)}>
                        Log a call
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>
            </CardBody>
          </Card>
        )
      )}

      {withDate.length === 0 && (
        <Card>
          <CardBody className="text-center text-[13px] text-ink-muted">
            No enquiry has a follow-up date on it yet.
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>No date set</CardTitle>
          <Badge tone="neutral">{unscheduled.length}</Badge>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Child", "Parent", "Stage", "Owner", ""]}
            empty={unscheduled.length === 0 && "Every enquiry has a date against it."}
          >
            {unscheduled.slice(0, 20).map((e) => (
              <tr key={e.id}>
                <td className={tdStrong}>
                  <Link href={`/school/admissions/${e.id}`} className="hover:underline">
                    {e.student_name}
                  </Link>
                </td>
                <td className={td}>
                  {e.parent_name}
                  <span className="block text-[11px] text-ink-subtle">{e.parent_phone}</span>
                </td>
                <td className={td}>
                  <Badge tone={stageTone(e.stage)}>{humanize(e.stage)}</Badge>
                </td>
                <td className={td}>{e.assigned_to_name ?? "Nobody"}</td>
                <td className={td}>
                  <Button size="sm" variant="secondary" onClick={() => open(e)}>
                    Log a call
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal
        open={logging !== null}
        onClose={() => setLogging(null)}
        title={logging ? `Log an activity — ${logging.student_name}` : ""}
      >
        <form onSubmit={submit} className="space-y-4">
          <Select label="What happened" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {humanize(k)}
              </option>
            ))}
          </Select>
          <Textarea
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            required
            placeholder="Spoke to the mother; visiting on Friday."
          />
          <Input
            label="Next follow-up"
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
            hint="Leave blank to clear the date and take it off this list."
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setLogging(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!note.trim()}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
