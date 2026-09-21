"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
// Aliased: this file already has a type called Inbox.
import { Clock, Inbox as InboxIcon, MailOpen, MessageSquare } from "lucide-react";

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
} from "@/components/ui/Field";
import { PanelFooter, PersonCell, StatStrip } from "@/components/ui/Workspace";
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

      {/* All four already come back from the two requests this page makes. */}
      <StatStrip
        stats={[
          {
            label: "Unread notices",
            value: unread,
            note: unread ? "Waiting on you" : "Nothing outstanding",
            icon: MailOpen,
          },
          { label: "Conversations", value: convos?.count ?? "—", icon: MessageSquare },
          {
            label: "Waiting on a teacher",
            value: convos?.awaiting_teacher ?? "—",
            note: convos && convos.awaiting_teacher > 0 ? "A parent is waiting" : "Nobody left waiting",
            icon: Clock,
          },
          { label: "Notices shown", value: items.length, icon: InboxIcon },
        ]}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Your notices</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Up to ten of the notices addressed to you.
            </p>
          </div>
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
          <div>
            <CardTitle>Parent and teacher conversations</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Every thread between a parent and a teacher, open or closed.
            </p>
          </div>
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
                <td className="px-4 py-2">
                  {c.parent_name ? (
                    <PersonCell name={c.parent_name} />
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
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
        <PanelFooter
          left={`${convos?.rows.length ?? 0} conversation(s)`}
          right={
            convos && convos.awaiting_teacher > 0
              ? `${convos.awaiting_teacher} waiting on a teacher`
              : "Nobody is waiting on a reply"
          }
        />
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
