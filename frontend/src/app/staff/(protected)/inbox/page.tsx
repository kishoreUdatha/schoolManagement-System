"use client";

import { useEffect, useState } from "react";
import { MailOpen } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { dateTime } from "@/lib/dates";

type Item = {
  recipient_id: number;
  notice_id: number;
  title: string;
  body: string;
  sent_at: string | null;
  read_at: string | null;
  attachment_url?: string | null;
};

/** Notices addressed to the person signed in.
 *
 *  Nothing new is stored behind this. Sending a notice to staff already
 *  created the rows; there was simply nowhere to read them, so anything sent
 *  to "all teachers" went into a drawer nobody could open.
 */
export default function StaffInboxPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (only = unreadOnly) => {
    api
      .get<Item[]>("/api/v1/staff/inbox", { params: { unread_only: only } })
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
    api
      .get<{ unread: number }>("/api/v1/staff/inbox/unread-count")
      .then((r) => setUnread(r.data.unread))
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly]);

  const markRead = async (item: Item) => {
    if (item.read_at) return;
    try {
      await api.post(`/api/v1/staff/inbox/${item.recipient_id}/mark-read`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const markAll = async () => {
    const pending = items.filter((i) => !i.read_at);
    for (const i of pending) {
      try {
        await api.post(`/api/v1/staff/inbox/${i.recipient_id}/mark-read`);
      } catch {
        // One failing must not strand the rest; the count below tells the
        // truth either way once it reloads.
      }
    }
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        subtitle="Notices the school has sent you."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
              />
              Unread only
            </label>
            <Button variant="secondary" onClick={markAll} disabled={unread === 0}>
              <MailOpen className="mr-1.5 h-4 w-4" />
              Mark all read
            </Button>
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Unread" value={unread} accent={unread ? "amber" : "emerald"} />
        <StatCard label="Showing" value={items.length} />
      </div>

      {items.length === 0 && (
        <NoticeBox>
          {unreadOnly
            ? "Nothing unread — you are up to date."
            : "The school has not sent you anything yet."}
        </NoticeBox>
      )}

      <div className="space-y-3">
        {items.map((i) => (
          <Card key={i.recipient_id} className={i.read_at ? undefined : "border-brand-300"}>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>{i.title}</CardTitle>
                <p className="mt-1 text-[12px] text-ink-subtle">
                  {i.sent_at ? dateTime(i.sent_at) : "Not sent yet"}
                </p>
              </div>
              {i.read_at ? (
                <Badge tone="neutral">Read</Badge>
              ) : (
                <Button variant="secondary" onClick={() => markRead(i)}>
                  Mark read
                </Button>
              )}
            </CardHeader>
            <CardBody>
              <p className="whitespace-pre-wrap text-[13px] text-ink-muted">{i.body}</p>
              {i.attachment_url && (
                <a
                  href={i.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-[13px] font-bold text-brand-600 hover:underline"
                >
                  Open the attachment
                </a>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
