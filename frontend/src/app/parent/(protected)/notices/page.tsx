"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type InboxItem = {
  recipient_id: number;
  notice_id: number;
  title: string;
  body: string;
  attachment_url: string | null;
  sent_at: string | null;
  read_at: string | null;
  status: string;
};

export default function ParentNoticesPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { data } = await api.get<InboxItem[]>("/api/v1/parent/me/notices");
      setItems(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markRead(item: InboxItem) {
    if (item.read_at) return;
    try {
      await api.post(`/api/v1/parent/me/notices/${item.recipient_id}/mark-read`);
      setItems((prev) =>
        prev.map((x) =>
          x.recipient_id === item.recipient_id
            ? { ...x, read_at: new Date().toISOString() }
            : x
        )
      );
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/parent" className="text-sm text-brand-700 hover:underline">
        ← Back to dashboard
      </Link>
      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Notices</h1>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}

      {items.length === 0 ? (
        <Card className="p-8 text-center text-ink-muted">No notices yet.</Card>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <Card
              key={n.recipient_id}
              className={
                "p-4 cursor-pointer transition " +
                (!n.read_at ? "border-brand-300 bg-brand-50/30" : "")
              }
              onClick={() => markRead(n)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!n.read_at && <Badge tone="brand">new</Badge>}
                    <h3 className="font-semibold text-ink">{n.title}</h3>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{n.body}</p>
                  {n.attachment_url && (
                    <a
                      href={n.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs text-brand-700 hover:underline"
                    >
                      View attachment →
                    </a>
                  )}
                </div>
                <div className="text-xs text-ink-muted">
                  {n.sent_at && new Date(n.sent_at).toLocaleDateString()}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
