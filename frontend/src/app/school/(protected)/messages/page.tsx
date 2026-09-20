"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MailOpen } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  WarnBox,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { dateTime } from "@/lib/dates";

type Inbox = {
  recipient_id: number;
  notice_id: number;
  title: string;
  body: string;
  sent_at: string | null;
  read_at: string | null;
};
type Conversation = {
  conversation_id: number;
  parent_name: string | null;
  teacher_name: string | null;
  student_name: string | null;
  messages: number;
  last_message_at: string | null;
  teacher_unread: number;
  parent_unread: number;
  closed: boolean;
  awaiting_teacher: boolean;
};
type Overview = {
  rows: Conversation[];
  count: number;
  awaiting_teacher: number;
  bodies_visible: boolean;
};

/** The office's two halves of messaging.
 *
 *  Its own notice inbox, and oversight of parent-teacher conversations. The
 *  second deliberately shows no message bodies: an administrator is not a
 *  participant, and a screen that quietly reproduced every word would change
 *  what a parent and a teacher are willing to write to each other. What an
 *  office can act on is whether a parent has been left waiting.
 */
export default function SchoolMessagesPage() {
  const [items, setItems] = useState<Inbox[]>([]);
  const [unread, setUnread] = useState(0);
  const [convos, setConvos] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .get<Inbox[]>("/api/v1/staff/inbox")
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
    api
      .get<{ unread: number }>("/api/v1/staff/inbox/unread-count")
      .then((r) => setUnread(r.data.unread))
      .catch(() => undefined);
    api
      .get<Overview>("/api/v1/school/event-ops/conversations")
      .then((r) => setConvos(r.data))
      .catch(() => setConvos(null));
  };

  useEffect(() => {
    load();
  }, []);

  const markRead = async (item: Inbox) => {
    try {
      await api.post(`/api/v1/staff/inbox/${item.recipient_id}/mark-read`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        subtitle="Notices sent to you, and how the parent-teacher conversations are going."
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unread notices" value={unread} accent={unread ? "amber" : "emerald"} />
        <StatCard label="Conversations" value={convos?.count ?? "—"} />
        <StatCard
          label="Waiting on a teacher"
          value={convos?.awaiting_teacher ?? "—"}
          accent={convos && convos.awaiting_teacher > 0 ? "amber" : "emerald"}
        />
        <StatCard label="Notices shown" value={items.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your notices</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {items.length === 0 && (
            <NoticeBox>Nothing has been sent to you yet.</NoticeBox>
          )}
          {items.slice(0, 10).map((i) => (
            <div
              key={i.recipient_id}
              className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border pb-3 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <div className="text-[14px] font-extrabold text-ink">{i.title}</div>
                <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-muted">{i.body}</p>
                <span className="text-[11px] text-ink-subtle">
                  {i.sent_at ? dateTime(i.sent_at) : "Not sent yet"}
                </span>
              </div>
              {i.read_at ? (
                <Badge tone="neutral">Read</Badge>
              ) : (
                <Button variant="secondary" onClick={() => markRead(i)}>
                  <MailOpen className="mr-1.5 h-4 w-4" />
                  Mark read
                </Button>
              )}
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parent and teacher conversations</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 p-0">
          <div className="px-5 pt-4">
            <WarnBox>
              Who is talking, not what was said. These conversations are between a parent
              and a teacher and you are not a participant in them — a screen that showed
              every word would change what both of them are willing to write.
            </WarnBox>
          </div>
          <Table
            head={["Parent", "Teacher", "About", "Messages", "Last message", "State"]}
            empty={(convos?.rows.length ?? 0) === 0 && "Nobody has started a conversation yet."}
          >
            {(convos?.rows ?? []).map((c) => (
              <tr key={c.conversation_id}>
                <td className={tdStrong}>{c.parent_name ?? "—"}</td>
                <td className={td}>{c.teacher_name ?? "—"}</td>
                <td className={td}>{c.student_name ?? "—"}</td>
                <td className={td}>{c.messages}</td>
                <td className={td}>
                  {c.last_message_at ? (
                    dateTime(c.last_message_at)
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
                <td className={td}>
                  {c.closed ? (
                    <Badge tone="neutral">Closed</Badge>
                  ) : c.awaiting_teacher ? (
                    <Badge tone="amber">{c.teacher_unread} waiting on the teacher</Badge>
                  ) : (
                    <Badge tone="emerald">Up to date</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <p className="text-[12px] text-ink-subtle">
        To write to families, send a{" "}
        <Link href="/school/notices" className="font-bold text-brand-600 hover:underline">
          notice
        </Link>
        . Conversations are started by a parent or a teacher, not by the office.
      </p>
    </div>
  );
}
