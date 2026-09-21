"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CalendarRange, Handshake, Images, PartyPopper } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Field";
import { Hero, QuickActions } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { auth } from "@/lib/auth";

type Child = {
  id: number;
  full_name: string;
  admission_no: string;
  roll_no: number;
  section_id: number;
  section_label: string | null;
  photo_url: string | null;
  is_active: boolean;
  attendance_percent: number | null;
  fees_pending_amount: number | null;
  relation: "father" | "mother" | "guardian" | "other";
};

type Holiday = {
  id: number;
  name: string;
  type: "national" | "school" | "vacation";
  start_date: string;
  end_date: string;
  days: number;
};

type InboxItem = {
  recipient_id: number;
  notice_id: number;
  title: string;
  body: string;
  sent_at: string | null;
  read_at: string | null;
};

export default function ParentDashboard() {
  const [children, setChildren] = useState<Child[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [notices, setNotices] = useState<InboxItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const user = auth.getUser();

  useEffect(() => {
    api
      .get<Child[]>("/api/v1/parent/me/children")
      .then((r) => setChildren(r.data))
      .catch((e) => setError(apiError(e)));
    api
      .get<Holiday[]>("/api/v1/parent/school/holidays?upcoming=true&limit=5")
      .then((r) => setHolidays(r.data))
      .catch(() => {});
    api
      .get<InboxItem[]>("/api/v1/parent/me/notices?limit=3")
      .then((r) => setNotices(r.data))
      .catch(() => {});
  }, []);

  const firstName = user?.full_name?.split(" ")[0] ?? "";
  // The rail only exists when there is something to put in it; otherwise the
  // children take the full width rather than sitting beside a gap.
  const hasRail = notices.length > 0 || holidays.length > 0;

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Dashboard"
        actions={
          <Link href="/parent/messages">
            <Button>Message the school</Button>
          </Link>
        }
      />

      {/* No figures strip here. The four numbers this page could show — how
          many children, how many unread notices — are the office's way of
          counting a family, and a parent opens this to see their children,
          not a tally of them. The hero carries the one sentence that matters
          when the link is missing. */}
      <Hero
        title={firstName ? `Welcome, ${firstName}` : "Welcome"}
        action={
          <Link href="/parent/notices">
            <Button variant="secondary">Notices</Button>
          </Link>
        }
      >
        {children.length === 0
          ? "Your account isn't linked to any students yet — contact the school office."
          : `You are linked to ${children.length} student${
              children.length === 1 ? "" : "s"
            }.`}
      </Hero>

      <QuickActions
        actions={[
          { label: "Calendar", href: "/parent/calendar", icon: CalendarRange },
          { label: "Teacher meetings", href: "/parent/meetings", icon: Handshake },
          { label: "Holidays", href: "/parent/holidays", icon: PartyPopper },
          { label: "Photo gallery", href: "/parent/gallery", icon: Images },
        ]}
      />

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}

      <div
        className={
          hasRail ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_304px]" : "grid gap-5"
        }
      >
        <div className="grid h-fit gap-4 sm:grid-cols-2">
          {children.map((c) => (
            <Link key={c.id} href={`/parent/children/${c.id}`}>
              <Card className="cursor-pointer transition hover:border-brand-300 hover:shadow">
                <CardBody>
                  <div className="flex items-center gap-3">
                    {c.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.photo_url}
                        alt={c.full_name}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 font-semibold">
                        {c.full_name
                          .split(" ")
                          .slice(0, 2)
                          .map((p) => p[0])
                          .join("")
                          .toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-semibold text-ink">{c.full_name}</div>
                      <div className="text-xs text-ink-muted">
                        {c.admission_no} · {c.section_label} · roll {c.roll_no}
                      </div>
                    </div>
                    <Badge tone="brand">{c.relation}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md bg-surface-subtle px-2 py-1.5">
                      <div className="text-xs text-ink-muted">Attendance</div>
                      <div className="font-medium text-ink-muted">
                        {c.attendance_percent != null
                          ? `${c.attendance_percent}%`
                          : "coming soon"}
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-subtle px-2 py-1.5">
                      <div className="text-xs text-ink-muted">Pending fees</div>
                      <div className="font-medium text-ink-muted">
                        {c.fees_pending_amount != null
                          ? `₹${c.fees_pending_amount}`
                          : "coming soon"}
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>

        {hasRail && (
          <div className="space-y-5">
            {notices.length > 0 && (
              <Card className="self-start">
                <CardHeader>
                  <CardTitle>Latest notices</CardTitle>
                  <Link
                    href="/parent/notices"
                    className="text-[12px] font-bold text-brand-600 hover:underline"
                  >
                    Inbox →
                  </Link>
                </CardHeader>
                <CardBody className="pt-0">
                  <ul className="space-y-2 text-sm">
                    {notices.map((n) => (
                      <li key={n.recipient_id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {!n.read_at && (
                              <span className="inline-block h-2 w-2 rounded-full bg-brand-500" />
                            )}
                            <span className="truncate font-medium text-ink">{n.title}</span>
                          </div>
                          <p className="line-clamp-1 text-xs text-ink-muted">{n.body}</p>
                        </div>
                        <span className="shrink-0 text-xs text-ink-muted">
                          {n.sent_at && new Date(n.sent_at).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )}

            {holidays.length > 0 && (
              <Card className="self-start">
                <CardHeader>
                  <CardTitle>Upcoming holidays</CardTitle>
                  <Link
                    href="/parent/holidays"
                    className="text-[12px] font-bold text-brand-600 hover:underline"
                  >
                    Full calendar →
                  </Link>
                </CardHeader>
                <CardBody className="pt-0">
                  <ul className="space-y-1 text-sm">
                    {holidays.map((h) => (
                      <li key={h.id} className="flex justify-between gap-3">
                        <span className="font-medium text-ink">{h.name}</span>
                        <span className="text-xs text-ink-muted">
                          {h.start_date === h.end_date
                            ? h.start_date
                            : `${h.start_date} → ${h.end_date}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
