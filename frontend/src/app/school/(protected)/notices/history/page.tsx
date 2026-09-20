"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { dateTime, toIso } from "@/lib/dates";

type Row = {
  recipient_id: number;
  notice_id: number;
  title: string;
  sent_on: string;
  to_user_id: number;
  to_name: string | null;
  to_role: string | null;
  channel: string;
  status: string;
  error: string | null;
  read_at: string | null;
};
type History = {
  from_date: string;
  to_date: string;
  rows: Row[];
  count: number;
  by_status: { status: string; count: number }[];
  truncated: boolean;
};

const CHANNELS = ["", "in_app", "email", "sms", "whatsapp"];

const TONE: Record<string, "emerald" | "amber" | "rose" | "neutral"> = {
  delivered: "emerald",
  sent: "emerald",
  queued: "amber",
  failed: "rose",
  skipped: "neutral",
};

/** What reached each person, across every notice.
 *
 *  The campaigns page answers "did this go out". This answers "what have we
 *  sent this family", which is the question asked when somebody says they
 *  were never told.
 */
export default function CommunicationHistoryPage() {
  const [data, setData] = useState<History | null>(null);
  const [from, setFrom] = useState(toIso(new Date(Date.now() - 90 * 86_400_000)));
  const [to, setTo] = useState(toIso());
  const [channel, setChannel] = useState("");
  const [who, setWho] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<History>("/api/v1/school/event-ops/history", {
        params: { from, to, channel: channel || undefined },
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [from, to, channel]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = (data?.rows ?? []).filter((r) =>
    who.trim() ? (r.to_name ?? "").toLowerCase().includes(who.trim().toLowerCase()) : true
  );
  const failed = data?.by_status.find((s) => s.status === "failed")?.count ?? 0;
  const skipped = data?.by_status.find((s) => s.status === "skipped")?.count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communication history"
        subtitle="Every message that reached a person, so you can answer whether a family was told."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Input
              label="From"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Select
              label="Channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              {CHANNELS.map((c) => (
                <option key={c || "all"} value={c}>
                  {c ? humanize(c) : "Every channel"}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={load}>
              Apply
            </Button>
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Messages" value={data?.count ?? "—"} />
        <StatCard label="Failed" value={failed} accent={failed ? "rose" : "emerald"} />
        <StatCard
          label="Skipped"
          value={skipped}
          accent={skipped ? "neutral" : "emerald"}
          hint={skipped ? "No address or number on file" : undefined}
        />
        <StatCard
          label="Read"
          value={data ? data.rows.filter((r) => r.read_at).length : "—"}
        />
      </div>

      {data?.truncated && (
        <WarnBox>
          This is the first {data.count} messages in the window. Narrow the dates or pick a
          channel to be sure you are seeing everything.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <Input
            placeholder="Filter by name"
            aria-label="Filter by name"
            value={who}
            onChange={(e) => setWho(e.target.value)}
          />
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Sent", "Notice", "To", "Channel", "State", "Read"]}
            empty={rows.length === 0 && "Nothing has been sent in this window."}
          >
            {rows.map((r) => (
              <tr key={r.recipient_id}>
                <td className={td}>{dateTime(r.sent_on)}</td>
                <td className={tdStrong}>{r.title}</td>
                <td className={td}>
                  {r.to_name ?? "—"}
                  {r.to_role && (
                    <span className="block text-[11px] text-ink-subtle">
                      {humanize(r.to_role)}
                    </span>
                  )}
                </td>
                <td className={td}>{humanize(r.channel)}</td>
                <td className={td}>
                  <Badge tone={TONE[r.status] ?? "neutral"}>{humanize(r.status)}</Badge>
                  {r.error && (
                    <span className="block text-[11px] text-ink-subtle">{r.error}</span>
                  )}
                </td>
                <td className={td}>
                  {r.read_at ? dateTime(r.read_at) : <span className="text-ink-subtle">—</span>}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <p className="text-[12px] text-ink-subtle">
        Skipped means there was no address or number on file for that channel, not that
        sending went wrong. Those two want different fixes.
      </p>
    </div>
  );
}
