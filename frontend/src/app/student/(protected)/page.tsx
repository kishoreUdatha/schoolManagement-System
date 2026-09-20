"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, Table, WarnBox, td, tdStrong } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { dateTime, hhmm, shortDate } from "@/lib/dates";

type HomeworkDue = {
  homework_id: number;
  title: string;
  subject_name: string | null;
  due_date: string;
  overdue: boolean;
  submitted: boolean;
};
type PeriodToday = {
  period_number: number;
  label: string | null;
  start_time: string;
  end_time: string;
  is_break: boolean;
  subject_name: string | null;
  teacher_name: string | null;
};
type NoticeItem = {
  notice_id: number;
  title: string;
  body: string | null;
  created_at: string;
};
type Dashboard = {
  student_id: number;
  full_name: string;
  admission_no: string;
  roll_no: number | null;
  class_name: string | null;
  section_name: string | null;
  photo_url: string | null;
  school_name: string;
  homework: HomeworkDue[];
  homework_due: number;
  homework_overdue: number;
  timetable: PeriodToday[];
  attendance: {
    marked_days: number;
    present: number;
    absent: number;
    half_day: number;
    percent: number;
  };
  recent_exams: { exam_id: number; name: string; end_date: string }[];
  notices: NoticeItem[];
};

const pieces = (n: number) => (n === 1 ? "1 piece" : `${n} pieces`);

/** The page a child opens most.
 *
 *  Written to be read quickly and without being told off. A child who is
 *  behind on their homework already knows — the job here is to say which
 *  ones and where to hand them in, not to make a point of it.
 */
export default function StudentHomePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Dashboard>("/api/v1/student/dashboard")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const firstName = data?.full_name.split(" ")[0] ?? "";
  const lessons = data?.timetable ?? [];
  const homework = data?.homework ?? [];
  const notices = data?.notices ?? [];
  const late = homework.filter((h) => h.overdue && !h.submitted);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">
          {data ? `Hello, ${firstName}` : "Hello"}
        </h1>
        {data && (
          <p className="mt-1.5 text-[13px] text-ink-muted">
            {[data.class_name, data.section_name].filter(Boolean).join(" ")}
            {data.class_name && " · "}
            {data.school_name}
          </p>
        )}
      </div>

      <ErrorBox>{error}</ErrorBox>

      {late.length > 0 && (
        <WarnBox>
          {pieces(late.length)} of homework {late.length === 1 ? "is" : "are"} past
          the day it was due:{" "}
          {late.map((h) => h.title).join(", ")}. You can still hand{" "}
          {late.length === 1 ? "it" : "them"} in —{" "}
          <Link href="/student/homework" className="underline">
            go to homework
          </Link>
          .
        </WarnBox>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Homework to do"
          value={data?.homework_due ?? "—"}
          accent={data && data.homework_due > 0 ? "amber" : "emerald"}
          hint={data && data.homework_due === 0 ? "Nothing waiting" : undefined}
        />
        {/* Attendance is never shown in red. A child who has been off ill did
            not choose it, and a red number reads as blame for something that
            is usually a parent's or a doctor's call. */}
        <StatCard
          label="Attendance"
          value={data ? `${data.attendance.percent}%` : "—"}
          accent={data && data.attendance.percent >= 90 ? "emerald" : "brand"}
          hint={data ? `${data.attendance.present} of ${data.attendance.marked_days} days` : undefined}
        />
        <StatCard
          label="Results out"
          value={data?.recent_exams.length ?? "—"}
          hint={data && data.recent_exams.length === 0 ? "None yet" : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today&rsquo;s lessons</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Time", "Lesson", "Teacher"]}
            empty={lessons.length === 0 && "There are no lessons on the timetable for today."}
          >
            {lessons.map((p) => (
              <tr key={p.period_number} className={p.is_break ? "bg-surface-subtle" : undefined}>
                <td className={td}>
                  {hhmm(p.start_time)}–{hhmm(p.end_time)}
                </td>
                <td className={p.is_break ? td : tdStrong}>
                  {p.is_break ? p.label ?? "Break" : p.subject_name ?? "—"}
                </td>
                <td className={td}>{p.is_break ? "—" : p.teacher_name ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Homework</CardTitle>
          <Link href="/student/homework" className="text-[12px] font-bold text-brand-600 hover:underline">
            See all
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Subject", "What to do", "Due", ""]}
            empty={homework.length === 0 && "You have no homework set at the moment."}
          >
            {homework.map((h) => (
              <tr key={h.homework_id}>
                <td className={td}>{h.subject_name ?? "—"}</td>
                <td className={tdStrong}>
                  <Link href="/student/homework" className="hover:underline">
                    {h.title}
                  </Link>
                </td>
                <td className={td}>{shortDate(h.due_date)}</td>
                <td className={td}>
                  {h.submitted ? (
                    <Badge tone="emerald">Handed in</Badge>
                  ) : h.overdue ? (
                    <Badge tone="rose">Late</Badge>
                  ) : (
                    <Badge tone="amber">To do</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>From school</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {notices.length === 0 && (
            <p className="text-[13px] text-ink-subtle">
              There is nothing from the school right now.
            </p>
          )}
          {notices.map((n) => (
            <div key={n.notice_id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[14px] font-extrabold text-ink">{n.title}</span>
                {/* created_at is a full timestamp; the date helpers take a
                    plain YYYY-MM-DD, so trim it before formatting. */}
                <span className="text-[11px] text-ink-subtle">
                  {dateTime(n.created_at)}
                </span>
              </div>
              {n.body && <p className="mt-1 text-[13px] text-ink-muted">{n.body}</p>}
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
