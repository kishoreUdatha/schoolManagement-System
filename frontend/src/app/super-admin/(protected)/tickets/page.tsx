"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  Inbox,
  Lock,
  MessageSquarePlus,
  Plus,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Select,
  Table,
  Textarea,
  WarnBox,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { dateTime } from "@/lib/dates";

/** A select sized for the filter bar: one row of equal-height controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Reply = {
  id: number;
  author: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
};
type Ticket = {
  id: number;
  tenant_id: number | null;
  tenant_name: string | null;
  raised_by: string | null;
  subject: string;
  body: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  resolved_at: string | null;
  created_at: string;
  replies: Reply[];
  reply_count: number;
};
type Queue = {
  tickets: Ticket[];
  open: number;
  waiting: number;
  resolved: number;
  closed: number;
  urgent_open: number;
};

const PRIORITY_TONE: Record<string, "neutral" | "amber" | "rose" | "brand"> = {
  low: "neutral",
  normal: "brand",
  high: "amber",
  urgent: "rose",
};
const STATUS_TONE: Record<string, "neutral" | "amber" | "emerald" | "rose"> = {
  open: "rose",
  waiting: "amber",
  resolved: "emerald",
  closed: "neutral",
};

export default function TicketsPage() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [state, setState] = useState("");
  const [open, setOpen] = useState<Ticket | null>(null);
  const [raising, setRaising] = useState(false);
  const [form, setForm] = useState({ subject: "", body: "", priority: "normal" });
  const [reply, setReply] = useState({ body: "", is_internal: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get<Queue>("/api/v1/super-admin/tickets", {
        params: { status: state || undefined },
      })
      .then((r) => setQueue(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const reopen = async (t: Ticket) => {
    const r = await api.get<Ticket>(`/api/v1/super-admin/tickets/${t.id}`);
    setOpen(r.data);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/super-admin/tickets", {
        subject: form.subject.trim(),
        body: form.body.trim(),
        priority: form.priority,
      });
      setRaising(false);
      setForm({ subject: "", body: "", priority: "normal" });
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!open) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Ticket>(
        `/api/v1/super-admin/tickets/${open.id}/replies`,
        { body: reply.body.trim(), is_internal: reply.is_internal }
      );
      setOpen(r.data);
      setReply({ body: "", is_internal: false });
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const change = async (field: "status" | "priority", value: string) => {
    if (!open) return;
    setError(null);
    try {
      const r = await api.patch<Ticket>(`/api/v1/super-admin/tickets/${open.id}`, {
        [field]: value,
      });
      setOpen(r.data);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const rows = queue?.tickets ?? [];

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Support"
        subtitle="What schools have reported, and what we have done about it."
        actions={
          <Button onClick={() => setRaising(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Raise one
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      {/* The counts the queue endpoint already returns, not a second call. */}
      <StatStrip
        stats={[
          { label: "Open", value: queue?.open ?? "—", note: "Still with us", icon: Inbox },
          {
            label: "Waiting on the school",
            value: queue?.waiting ?? "—",
            note: "We have asked something",
            icon: Hourglass,
          },
          {
            label: "Resolved",
            value: queue?.resolved ?? "—",
            note: "Answered and closed off",
            icon: CheckCircle2,
          },
          {
            label: "Urgent and open",
            value: queue?.urgent_open ?? "—",
            note: queue && queue.urgent_open ? "Waiting on us now" : "Nothing urgent outstanding",
            icon: AlertTriangle,
          },
        ]}
      />

      <FilterBar>
        <select
          aria-label="Status"
          value={state}
          onChange={(e) => setState(e.target.value)}
          className={filterSelect}
        >
          <option value="">Every ticket</option>
          <option value="open">Open</option>
          <option value="waiting">Waiting on the school</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </FilterBar>

      {queue && queue.urgent_open > 0 && (
        <WarnBox>
          {queue.urgent_open} urgent ticket(s) are still open.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>The queue</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {state ? humanize(state) : "Every ticket"} · newest first · click a row to open it
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Subject", "School", "Priority", "Status", "Raised", "Replies"]}
            empty={rows.length === 0 && "Nothing has been reported yet."}
          >
            {rows.map((t) => (
              <tr
                key={t.id}
                className="cursor-pointer hover:bg-surface-hover"
                onClick={() => reopen(t)}
              >
                <td className={tdStrong}>{t.subject}</td>
                <td className={td}>
                  {t.tenant_name ?? <span className="text-ink-subtle">Internal</span>}
                </td>
                <td className={td}>
                  <Badge tone={PRIORITY_TONE[t.priority] ?? "neutral"}>
                    {humanize(t.priority)}
                  </Badge>
                </td>
                <td className={td}>
                  <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>
                    {humanize(t.status)}
                  </Badge>
                </td>
                <td className={td}>{dateTime(t.created_at)}</td>
                <td className={td}>{t.reply_count}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`Showing ${rows.length} ticket${rows.length === 1 ? "" : "s"}`}
          right={queue ? `${queue.closed} closed in total` : undefined}
        />
      </Card>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.subject ?? ""}
        size="lg"
      >
        {open && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <Select
                label="Status"
                value={open.status}
                onChange={(e) => change("status", e.target.value)}
              >
                <option value="open">Open</option>
                <option value="waiting">Waiting on the school</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </Select>
              <Select
                label="Priority"
                value={open.priority}
                onChange={(e) => change("priority", e.target.value)}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </div>

            <div className="rounded-lg border border-surface-border p-3">
              <p className="text-[12px] font-bold text-ink-muted">
                {open.tenant_name ?? "Internal"}
                {open.raised_by ? ` · ${open.raised_by}` : ""} ·{" "}
                {dateTime(open.created_at)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink">{open.body}</p>
            </div>

            <div className="space-y-2">
              {open.replies.length === 0 && (
                <p className="text-[13px] text-ink-subtle">No replies yet.</p>
              )}
              {open.replies.map((r) => (
                <div
                  key={r.id}
                  className={
                    r.is_internal
                      ? "rounded-lg border border-warning/25 bg-warning-bg p-3"
                      : "rounded-lg border border-surface-border p-3"
                  }
                >
                  <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink-muted">
                    {r.is_internal && <Lock className="h-3.5 w-3.5" />}
                    {r.author ?? "Somebody"} · {dateTime(r.created_at)}
                    {r.is_internal && " · the school never sees this"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink">{r.body}</p>
                </div>
              ))}
            </div>

            <Textarea
              label="Reply"
              rows={3}
              value={reply.body}
              onChange={(e) => setReply({ ...reply, body: e.target.value })}
            />
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              <input
                type="checkbox"
                checked={reply.is_internal}
                onChange={(e) => setReply({ ...reply, is_internal: e.target.checked })}
              />
              Keep this between us — the school will not see it
            </label>
            <div className="flex justify-end">
              <Button onClick={send} loading={busy} disabled={reply.body.trim().length < 2}>
                <MessageSquarePlus className="mr-1.5 h-4 w-4" />
                {reply.is_internal ? "Add a note" : "Reply"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={raising} onClose={() => setRaising(false)} title="Raise a ticket">
        <div className="space-y-4">
          <Input
            label="Subject"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
          <Textarea
            label="What is wrong"
            rows={4}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
          <Select
            label="Priority"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRaising(false)}>
              Cancel
            </Button>
            <Button
              onClick={create}
              loading={busy}
              disabled={form.subject.trim().length < 3 || form.body.trim().length < 3}
            >
              Raise it
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
