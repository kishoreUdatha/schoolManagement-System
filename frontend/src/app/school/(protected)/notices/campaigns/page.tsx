"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Select,
  Table,
  WarnBox,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { dateTime } from "@/lib/dates";

type Channel = {
  channel: string;
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
  skipped: number;
  read: number;
};
type Row = {
  notice_id: number;
  title: string;
  audience: string;
  channels: string[];
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  created_by: string | null;
  recipients: number;
  read: number;
  delivery: Channel[];
  overdue: boolean;
};
type Campaigns = {
  rows: Row[];
  sent: number;
  scheduled: number;
  draft: number;
  overdue: number;
  scheduler_running: boolean;
};

const STATES = ["", "draft", "scheduled", "sent"];

/** Every notice and what became of it.
 *
 *  Skipped is shown apart from failed everywhere below. Skipped means there
 *  was no number or address on file; failed means we tried and could not.
 *  A screen that adds them together sends somebody to debug a gateway when
 *  the answer is a blank column in a spreadsheet.
 */
export default function CampaignsPage() {
  const [data, setData] = useState<Campaigns | null>(null);
  const [state, setState] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Campaigns>("/api/v1/school/event-ops/campaigns", {
        params: { state: state || undefined },
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [state]);

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        subtitle="Every notice the school has written, and how far each one got."
        actions={
          <Select
            label="Show"
            value={state}
            onChange={(e) => setState(e.target.value)}
            aria-label="Filter by state"
          >
            {STATES.map((s) => (
              <option key={s || "all"} value={s}>
                {s ? humanize(s) : "Everything"}
              </option>
            ))}
          </Select>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sent" value={data?.sent ?? "—"} accent="emerald" />
        <StatCard label="Scheduled" value={data?.scheduled ?? "—"} />
        <StatCard label="Draft" value={data?.draft ?? "—"} />
        <StatCard
          label="Past their time"
          value={data?.overdue ?? "—"}
          accent={data && data.overdue > 0 ? "amber" : "emerald"}
        />
      </div>

      {data && !data.scheduler_running && data.scheduled > 0 && (
        <WarnBox>
          Nothing sends a notice on a timer in this deployment. A scheduled notice waits
          until somebody opens it and presses send — the time on it is a reminder, not an
          instruction to the system.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Notices</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Notice", "Audience", "When", "Recipients", "Read", "State", ""]}
            empty={rows.length === 0 && "No notices have been written yet."}
          >
            {rows.map((r) => (
              <tr key={r.notice_id}>
                <td className={tdStrong}>
                  {r.title}
                  <span className="block text-[11px] font-normal text-ink-subtle">
                    {r.channels.map(humanize).join(", ") || "no channel"}
                    {r.created_by ? ` · ${r.created_by}` : ""}
                  </span>
                </td>
                <td className={td}>{humanize(r.audience)}</td>
                <td className={td}>
                  {r.sent_at ? (
                    dateTime(r.sent_at)
                  ) : r.scheduled_at ? (
                    <>
                      {dateTime(r.scheduled_at)}
                      {r.overdue && (
                        <span className="block text-[11px] font-bold text-[#8E5C05]">
                          time has passed
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
                <td className={td}>{r.recipients}</td>
                <td className={td}>
                  {r.recipients ? `${r.read} of ${r.recipients}` : "—"}
                </td>
                <td className={td}>
                  <Badge
                    tone={
                      r.status === "sent"
                        ? "emerald"
                        : r.status === "scheduled"
                          ? "amber"
                          : "neutral"
                    }
                  >
                    {humanize(r.status)}
                  </Badge>
                </td>
                <td className={td}>
                  {r.delivery.length > 0 && (
                    <button
                      type="button"
                      className="font-bold text-brand-600 hover:underline"
                      onClick={() => setOpen(open === r.notice_id ? null : r.notice_id)}
                    >
                      {open === r.notice_id ? "Hide" : "Delivery"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      {open !== null &&
        (() => {
          const r = rows.find((x) => x.notice_id === open);
          if (!r) return null;
          return (
            <Card>
              <CardHeader>
                <CardTitle>{r.title} — delivery</CardTitle>
              </CardHeader>
              <CardBody className="space-y-3 p-0">
                <Table
                  head={["Channel", "Total", "Delivered", "Sent", "Queued", "Failed", "Skipped"]}
                  empty={r.delivery.length === 0 && "Nothing has gone out."}
                >
                  {r.delivery.map((c) => (
                    <tr key={c.channel}>
                      <td className={tdStrong}>{humanize(c.channel)}</td>
                      <td className={td}>{c.total}</td>
                      <td className={td}>{c.delivered || "—"}</td>
                      <td className={td}>{c.sent || "—"}</td>
                      <td className={td}>{c.queued || "—"}</td>
                      <td className={td}>
                        {c.failed ? <Badge tone="rose">{c.failed}</Badge> : "—"}
                      </td>
                      <td className={td}>
                        {c.skipped ? <Badge tone="neutral">{c.skipped}</Badge> : "—"}
                      </td>
                    </tr>
                  ))}
                </Table>
                <p className="px-5 pb-4 text-[12px] text-ink-subtle">
                  Skipped is not a failure — it is a family with no number or address on
                  file for that channel. Chasing it means filling in a record, not fixing
                  a gateway.
                </p>
              </CardBody>
            </Card>
          );
        })()}

      <p className="text-[12px] text-ink-subtle">
        Looking for one family&apos;s messages rather than one notice?{" "}
        <Link href="/school/notices/history" className="font-bold text-brand-600 hover:underline">
          Communication history
        </Link>{" "}
        lists what reached each person.
      </p>
    </div>
  );
}
