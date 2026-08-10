"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome, {user?.full_name?.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {children.length === 0
            ? "Your account isn't linked to any students yet — contact the school office."
            : `You are linked to ${children.length} student${
                children.length === 1 ? "" : "s"
              }.`}
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {notices.length > 0 && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                Latest notices
              </h3>
              <Link
                href="/parent/notices"
                className="text-xs text-brand-700 hover:underline"
              >
                Inbox →
              </Link>
            </div>
            <ul className="mt-2 space-y-2 text-sm">
              {notices.map((n) => (
                <li key={n.recipient_id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {!n.read_at && (
                        <span className="inline-block h-2 w-2 rounded-full bg-brand-500" />
                      )}
                      <span className="truncate font-medium text-slate-900">{n.title}</span>
                    </div>
                    <p className="line-clamp-1 text-xs text-slate-600">{n.body}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">
                    {n.sent_at && new Date(n.sent_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {holidays.length > 0 && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                Upcoming holidays
              </h3>
              <Link
                href="/parent/holidays"
                className="text-xs text-brand-700 hover:underline"
              >
                Full calendar →
              </Link>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {holidays.map((h) => (
                <li key={h.id} className="flex justify-between gap-3">
                  <span className="font-medium text-slate-900">{h.name}</span>
                  <span className="text-xs text-slate-500">
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

      <div className="grid gap-4 sm:grid-cols-2">
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
                    <div className="font-semibold text-slate-900">{c.full_name}</div>
                    <div className="text-xs text-slate-500">
                      {c.admission_no} · {c.section_label} · roll {c.roll_no}
                    </div>
                  </div>
                  <Badge tone="brand">{c.relation}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-slate-50 px-2 py-1.5">
                    <div className="text-xs text-slate-500">Attendance</div>
                    <div className="font-medium text-slate-700">
                      {c.attendance_percent != null
                        ? `${c.attendance_percent}%`
                        : "coming soon"}
                    </div>
                  </div>
                  <div className="rounded-md bg-slate-50 px-2 py-1.5">
                    <div className="text-xs text-slate-500">Pending fees</div>
                    <div className="font-medium text-slate-700">
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
    </div>
  );
}
