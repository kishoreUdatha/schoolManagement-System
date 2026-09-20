"use client";

import { useEffect, useState } from "react";

import { BreakdownChart, ChartCard, ShareChart, TrendChart } from "@/components/charts/Charts";
import { SERIES } from "@/components/charts/theme";
import { DateRange, ReportShell } from "@/components/reports/ReportShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, humanize, td, tdStrong } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type ChannelRow = {
  channel: string;
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
  skipped: number;
};
type NotificationReport = {
  from_date: string;
  to_date: string;
  notices: number;
  recipients: number;
  by_audience: { label: string; count: number }[];
  by_month: { month: string; count: number }[];
  channels: ChannelRow[];
};

/** A message that was skipped was never attempted — there was no mobile
 *  number, or no email, on the parent's record. Counting it against the
 *  delivery rate sends somebody hunting a bug in the sending code when the
 *  fix is a missing field on a student, so it is left out of the denominator
 *  everywhere a percentage appears on this page. */
const attempted = (c: ChannelRow) => c.total - c.skipped;
const deliveredPct = (delivered: number, tried: number) =>
  tried > 0 ? Math.round((delivered / tried) * 1000) / 10 : null;

export default function NotificationReportPage() {
  const [data, setData] = useState<NotificationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = () =>
    api
      .get<NotificationReport>("/api/v1/school/analytics/notifications", {
        params: { from: from || undefined, to: to || undefined },
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const channels = data?.channels ?? [];
  const months = data?.by_month ?? [];
  const audience = data?.by_audience ?? [];

  const tried = channels.reduce((n, c) => n + attempted(c), 0);
  const delivered = channels.reduce((n, c) => n + c.delivered, 0);
  const failed = channels.reduce((n, c) => n + c.failed, 0);
  const skipped = channels.reduce((n, c) => n + c.skipped, 0);
  const overall = deliveredPct(delivered, tried);

  return (
    <ReportShell
      title="Notifications"
      subtitle="What the school sent, who it went to, and how much of it reached a device."
      error={error}
      actions={<DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} onApply={load} />}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Notices sent"
          value={data?.notices ?? "—"}
          hint={data ? `${data.from_date} to ${data.to_date}` : undefined}
        />
        <StatCard label="Recipients" value={data?.recipients ?? "—"} />
        <StatCard
          label="Delivered"
          value={overall === null ? "—" : `${overall}%`}
          hint={tried > 0 ? `${delivered} of ${tried} attempted` : undefined}
          accent={overall !== null && overall < 90 ? "amber" : "emerald"}
        />
        <StatCard
          label="Failed"
          value={data ? failed : "—"}
          hint={skipped > 0 ? `${skipped} skipped for want of a number` : undefined}
          accent={failed > 0 ? "rose" : "emerald"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Notices over time"
          subtitle="How many were published each month."
          empty={months.length === 0 && "No notices have been published in this period."}
        >
          <TrendChart data={months} x="month" series={[{ key: "count", name: "Notices" }]} />
        </ChartCard>

        <ChartCard
          title="Who they went to"
          subtitle="The audience each notice was addressed to."
          empty={audience.length === 0 && "No notices have been published in this period."}
        >
          <ShareChart
            data={audience.map((a) => ({ audience: humanize(a.label), count: a.count }))}
            nameKey="audience"
            valueKey="count"
            centreValue={data ? String(data.notices) : undefined}
            centreLabel="notices"
          />
        </ChartCard>
      </div>

      <ChartCard
        title="By channel"
        subtitle="Every message, stacked by what became of it."
        empty={channels.length === 0 && "Nothing has been sent in this period."}
      >
        <BreakdownChart
          data={channels.map((c) => ({
            channel: humanize(c.channel),
            Delivered: c.delivered,
            Sent: c.sent,
            Queued: c.queued,
            Failed: c.failed,
            Skipped: c.skipped,
          }))}
          x="channel"
          stacked
          series={[
            { key: "Delivered", name: "Delivered", color: SERIES[1] },
            { key: "Sent", name: "Sent", color: SERIES[0] },
            { key: "Queued", name: "Queued", color: SERIES[7] },
            { key: "Failed", name: "Failed", color: SERIES[3] },
            { key: "Skipped", name: "Skipped", color: SERIES[2] },
          ]}
        />
      </ChartCard>

      <Card>
        <CardHeader>
          <CardTitle>Channel by channel</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Channel", "Total", "Delivered", "Sent", "Queued", "Failed", "Skipped", "Rate"]}
            empty={channels.length === 0 && "Nothing has been sent in this period."}
          >
            {channels.map((c) => {
              const pct = deliveredPct(c.delivered, attempted(c));
              return (
                <tr key={c.channel}>
                  <td className={tdStrong}>{humanize(c.channel)}</td>
                  <td className={td}>{c.total}</td>
                  <td className={td}>{c.delivered || "—"}</td>
                  <td className={td}>{c.sent || "—"}</td>
                  <td className={td}>{c.queued || "—"}</td>
                  <td className={td}>
                    {c.failed > 0 ? <Badge tone="rose">{c.failed}</Badge> : "—"}
                  </td>
                  <td className={td}>
                    {c.skipped > 0 ? <Badge tone="neutral">{c.skipped}</Badge> : "—"}
                  </td>
                  <td className={td}>
                    {pct === null ? (
                      <span className="text-ink-subtle">Nothing attempted</span>
                    ) : (
                      <Badge tone={pct >= 95 ? "emerald" : pct >= 80 ? "amber" : "rose"}>{pct}%</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </CardBody>
      </Card>

      <p className="text-[12px] leading-relaxed text-ink-muted">
        Skipped is not a failure. Those messages were never attempted because the parent has no
        mobile number or email address on file, so they are left out of the delivered percentage —
        chasing them means filling in a student record, not fixing the sending.
      </p>
    </ReportShell>
  );
}
