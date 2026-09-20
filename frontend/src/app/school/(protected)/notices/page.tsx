"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Audience =
  | "all_parents"
  | "all_teachers"
  | "all_staff"
  | "class_parents";
type Channel = "in_app" | "email" | "sms" | "whatsapp";
type NoticeStatus = "draft" | "scheduled" | "sent";

type Delivery = {
  channel: Channel;
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  skipped: number;
};

type Notice = {
  id: number;
  title: string;
  body: string;
  audience: Audience;
  audience_class_id: number | null;
  audience_class_name: string | null;
  channels: Channel[];
  attachment_url: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  status: NoticeStatus;
  created_at: string;
  recipient_count: number;
  delivery: Delivery[];
};

type SchoolClass = { id: number; name: string };

const audienceLabel: Record<Audience, string> = {
  all_parents: "All parents",
  all_teachers: "All teachers",
  all_staff: "All staff",
  class_parents: "Class parents",
};

const channelLabel: Record<Channel, string> = {
  in_app: "In-app",
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

const statusTone: Record<NoticeStatus, "neutral" | "amber" | "emerald"> = {
  draft: "neutral",
  scheduled: "amber",
  sent: "emerald",
};

export default function NoticesPage() {
  const [items, setItems] = useState<Notice[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [viewing, setViewing] = useState<Notice | null>(null);

  async function load() {
    try {
      const [n, y, c] = await Promise.all([
        api.get<Notice[]>("/api/v1/school/notices"),
        api.get<{ id: number; is_current: boolean }[]>(
          "/api/v1/school/academic-years"
        ),
        // Will be filled after year is found
        Promise.resolve(null),
      ]);
      setItems(n.data);
      const cur = y.data.find((x) => x.is_current) ?? y.data[0];
      if (cur) {
        const cs = await api.get<SchoolClass[]>("/api/v1/school/classes", {
          params: { academic_year_id: cur.id },
        });
        setClasses(cs.data);
      }
      void c;
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function send(n: Notice) {
    if (
      !window.confirm(
        `Send "${n.title}" to ${audienceLabel[n.audience]}${
          n.audience_class_name ? ` — ${n.audience_class_name}` : ""
        }?`
      )
    )
      return;
    try {
      const { data } = await api.post<Notice>(
        `/api/v1/school/notices/${n.id}/send`
      );
      setNotice(`Sent to ${data.recipient_count} recipient(s).`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function remove(n: Notice) {
    if (!window.confirm(`Delete "${n.title}"?`)) return;
    try {
      await api.delete(`/api/v1/school/notices/${n.id}`);
      setNotice(`Deleted.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Notices</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Announce updates to parents, teachers, or a specific class. In-app
            delivery is live; SMS/email/WhatsApp are queued as <em>skipped</em>{" "}
            until providers are wired.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>+ New notice</Button>
      </div>

      {error && (
        <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-[#E9F7F0] px-4 py-3 text-[13px] font-medium text-[#07845E] dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>
      )}

      <div className="space-y-3">
        {items.map((n) => (
          <Card key={n.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{n.title}</h3>
                  <Badge tone={statusTone[n.status]}>{n.status}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{n.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>
                    Audience:{" "}
                    <strong>
                      {audienceLabel[n.audience]}
                      {n.audience_class_name ? ` — ${n.audience_class_name}` : ""}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>Channels: {n.channels.map((c) => channelLabel[c]).join(", ")}</span>
                  {n.sent_at && (
                    <>
                      <span>·</span>
                      <span>Sent {new Date(n.sent_at).toLocaleString()}</span>
                    </>
                  )}
                  {n.scheduled_at && !n.sent_at && (
                    <>
                      <span>·</span>
                      <span>Scheduled {new Date(n.scheduled_at).toLocaleString()}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {n.status === "sent" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setViewing(n)}
                  >
                    Delivery report
                  </Button>
                )}
                {n.status !== "sent" && (
                  <>
                    <Button size="sm" onClick={() => send(n)}>
                      Send now
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(n)}>
                      Edit
                    </Button>
                  </>
                )}
                <Button size="sm" variant="danger" onClick={() => remove(n)}>
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {items.length === 0 && (
          <Card className="p-8 text-center text-slate-500">
            No notices yet — click <strong>+ New notice</strong>.
          </Card>
        )}
      </div>

      {(openCreate || editing) && (
        <NoticeFormModal
          existing={editing}
          classes={classes}
          onClose={() => {
            setOpenCreate(false);
            setEditing(null);
          }}
          onSaved={(action) => {
            setOpenCreate(false);
            setEditing(null);
            setNotice(action);
            load();
          }}
        />
      )}

      {viewing && (
        <DeliveryReportModal
          notice={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function NoticeFormModal({
  existing,
  classes,
  onClose,
  onSaved,
}: {
  existing: Notice | null;
  classes: SchoolClass[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    title: existing?.title ?? "",
    body: existing?.body ?? "",
    audience: (existing?.audience ?? "all_parents") as Audience,
    audience_class_id: existing?.audience_class_id ?? "",
    attachment_url: existing?.attachment_url ?? "",
    scheduled_at: existing?.scheduled_at?.slice(0, 16) ?? "",
  });
  const [channels, setChannels] = useState<Set<Channel>>(
    new Set(existing?.channels ?? ["in_app"])
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleChannel(c: Channel) {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        title: form.title,
        body: form.body,
        audience: form.audience,
        audience_class_id:
          form.audience === "class_parents" ? form.audience_class_id : null,
        attachment_url: form.attachment_url || null,
        channels: Array.from(channels),
        scheduled_at: form.scheduled_at
          ? new Date(form.scheduled_at).toISOString()
          : null,
      };
      if (existing) {
        await api.patch(`/api/v1/school/notices/${existing.id}`, payload);
        onSaved("Notice updated.");
      } else {
        await api.post("/api/v1/school/notices", payload);
        onSaved("Notice saved as draft.");
      }
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? `Edit notice` : "New notice"}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Title *"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Message *</span>
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={4}
            required
            className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Audience *</span>
            <select
              value={form.audience}
              onChange={(e) =>
                setForm({ ...form, audience: e.target.value as Audience })
              }
              className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="all_parents">All parents</option>
              <option value="all_teachers">All teachers</option>
              <option value="all_staff">All staff (teachers + non-teaching)</option>
              <option value="class_parents">Parents of a specific class</option>
            </select>
          </label>
          {form.audience === "class_parents" && (
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-muted">Class *</span>
              <select
                value={form.audience_class_id ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    audience_class_id: e.target.value ? Number(e.target.value) : "",
                  })
                }
                className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
                required
              >
                <option value="">Select…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <Input
          label="Attachment URL"
          value={form.attachment_url}
          onChange={(e) =>
            setForm({ ...form, attachment_url: e.target.value })
          }
          placeholder="https://…"
        />
        <Input
          label="Schedule for later (optional)"
          type="datetime-local"
          value={form.scheduled_at}
          onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
          hint="If set, status becomes 'scheduled'. You must still click 'Send now' to dispatch — automated cron not yet built."
        />
        <div>
          <div className="text-sm font-medium text-slate-700">Channels *</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["in_app", "email", "sms", "whatsapp"] as Channel[]).map((c) => {
              const active = channels.has(c);
              const live = c === "in_app";
              return (
                <button
                  type="button"
                  key={c}
                  onClick={() => toggleChannel(c)}
                  className={
                    "rounded-full border px-3 py-1 text-xs font-medium transition " +
                    (active
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50")
                  }
                  title={live ? "Live" : "Will be skipped until provider configured"}
                >
                  {channelLabel[c]} {!live && active ? "(skipped)" : ""}
                </button>
              );
            })}
          </div>
        </div>
        {error && (
          <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {existing ? "Save" : "Save draft"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeliveryReportModal({
  notice,
  onClose,
}: {
  notice: Notice;
  onClose: () => void;
}) {
  const totals = useMemo(() => {
    let total = 0,
      sent = 0,
      skipped = 0,
      failed = 0;
    notice.delivery.forEach((d) => {
      total += d.total;
      sent += d.sent;
      skipped += d.skipped;
      failed += d.failed;
    });
    return { total, sent, skipped, failed };
  }, [notice]);

  return (
    <Modal open onClose={onClose} title={`Delivery — ${notice.title}`} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3 text-center text-sm">
          <Stat label="Recipients" value={notice.recipient_count} />
          <Stat label="Sent" value={totals.sent} tone="emerald" />
          <Stat label="Skipped" value={totals.skipped} tone="amber" />
          <Stat label="Failed" value={totals.failed} tone="rose" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Per channel</CardTitle>
          </CardHeader>
          <CardBody>
            <table className="min-w-full divide-y divide-surface-border text-[13px]">
              <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                <tr>
                  <th className="px-2 py-1 font-medium">Channel</th>
                  <th className="px-2 py-1 font-medium">Total</th>
                  <th className="px-2 py-1 font-medium">Sent</th>
                  <th className="px-2 py-1 font-medium">Delivered</th>
                  <th className="px-2 py-1 font-medium">Failed</th>
                  <th className="px-2 py-1 font-medium">Skipped</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {notice.delivery.map((d) => (
                  <tr key={d.channel}>
                    <td className="px-2 py-1 font-medium">{channelLabel[d.channel]}</td>
                    <td className="px-2 py-1">{d.total}</td>
                    <td className="px-2 py-1 text-emerald-700">{d.sent}</td>
                    <td className="px-2 py-1 text-emerald-700">{d.delivered}</td>
                    <td className="px-2 py-1 text-rose-700">{d.failed}</td>
                    <td className="px-2 py-1 text-amber-700">{d.skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({
  label,
  value,
  tone = "brand",
}: {
  label: string;
  value: number;
  tone?: "brand" | "emerald" | "amber" | "rose";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
      ? "text-amber-700"
      : tone === "rose"
      ? "text-rose-700"
      : "text-brand-700";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
    </div>
  );
}
