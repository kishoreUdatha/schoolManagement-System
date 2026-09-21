"use client";

import { useCallback, useEffect, useState } from "react";
import { MailCheck, Send, SkipForward, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Table,
  WarnBox,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import {
  FilterBar,
  PanelFooter,
  PersonCell,
  SearchBox,
  StatStrip,
} from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { dateTime, toIso } from "@/lib/dates";

/** A control sized for the filter bar: same height as the search box, and no
 *  stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

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
      />
      <ErrorBox>{error}</ErrorBox>

      {/* The window the API just returned, read four ways. */}
      <StatStrip
        stats={[
          {
            label: "Messages",
            value: data?.count ?? "—",
            note: data ? `${data.from_date} to ${data.to_date}` : "In this window",
            icon: Send,
          },
          {
            label: "Failed",
            value: failed,
            note: failed ? "Sending went wrong" : "Nothing failed",
            icon: TriangleAlert,
          },
          {
            label: "Skipped",
            value: skipped,
            note: skipped ? "No address or number on file" : "Nothing skipped",
            icon: SkipForward,
          },
          {
            label: "Read",
            value: data ? data.rows.filter((r) => r.read_at).length : "—",
            note: "Opened by the person it went to",
            icon: MailCheck,
          },
        ]}
      />

      <FilterBar>
        <SearchBox
          value={who}
          onChange={setWho}
          placeholder="Filter by name…"
          label="Filter by name"
        />
        <input
          type="date"
          aria-label="From"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={filterSelect}
        />
        <input
          type="date"
          aria-label="To"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className={filterSelect}
        />
        <select
          aria-label="Channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className={filterSelect}
        >
          {CHANNELS.map((c) => (
            <option key={c || "all"} value={c}>
              {c ? humanize(c) : "Every channel"}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={load}>
          Apply
        </Button>
      </FilterBar>

      {data?.truncated && (
        <WarnBox>
          This is the first {data.count} messages in the window. Narrow the dates or pick a
          channel to be sure you are seeing everything.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Messages</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {[
                data ? `${data.from_date} to ${data.to_date}` : "Loading the window",
                channel ? humanize(channel) : "Every channel",
                who.trim() ? `Matching “${who.trim()}”` : "Everybody",
              ].join(" · ")}
            </p>
          </div>
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
                <td className="px-4 py-3">
                  {r.to_name ? (
                    <PersonCell
                      name={r.to_name}
                      sub={r.to_role ? humanize(r.to_role) : null}
                    />
                  ) : (
                    <span className="text-[13px] text-ink-subtle">—</span>
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
        <PanelFooter
          left={`Showing ${rows.length} of ${data?.count ?? 0} message(s)`}
          right={data?.truncated ? "Window truncated — narrow the dates" : "All of this window"}
        />
      </Card>

      <p className="text-[12px] text-ink-subtle">
        Skipped means there was no address or number on file for that channel, not that
        sending went wrong. Those two want different fixes.
      </p>
    </div>
  );
}
