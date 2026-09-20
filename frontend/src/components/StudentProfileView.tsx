"use client";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";

export type StudentProfile = {
  id: number;
  admission_no: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  blood_group: string | null;
  photo_url: string | null;
  address: string | null;
  is_active: boolean;
  roll_no: number;
  section_id: number;
  section_name: string | null;
  class_id: number | null;
  class_name: string | null;
  academic_year_id: number;
  academic_year_name: string | null;
  parents: {
    user_id: number;
    full_name: string;
    email: string | null;
    phone: string | null;
    relation: string;
  }[];
  attendance: {
    days_present: number;
    days_absent: number;
    days_late: number;
    days_half_day: number;
    days_marked: number;
    attendance_percent: number | null;
  };
  behaviour_recent: {
    id: number;
    period_kind: string;
    period_key: string;
    average: number;
    punctuality: number;
    participation: number;
    discipline: number;
    respect: number;
    teacher_note: string | null;
    rated_by_name: string | null;
    created_at: string;
  }[];
  exams: {
    exam_id: number;
    exam_name: string;
    exam_kind: string;
    published_at: string | null;
    percentage: number;
    overall_grade: string;
    is_pass: boolean;
  }[];
  homework_recent: {
    id: number;
    title: string;
    subject_name: string | null;
    subject_code: string | null;
    due_date: string;
    is_past_due: boolean;
  }[];
  fees_pending_amount: number;
};

export function StudentProfileView({
  profile,
  showParentContacts = true,
}: {
  profile: StudentProfile;
  showParentContacts?: boolean;
}) {
  const initials = profile.full_name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-4">
        {profile.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.photo_url}
            alt={profile.full_name}
            className="h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-2xl font-semibold text-brand-700">
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">
              {profile.full_name}
            </h1>
            {!profile.is_active && <Badge tone="neutral">Inactive</Badge>}
          </div>
          <div className="mt-1.5 text-[13px] text-ink-muted">
            {profile.admission_no} · {profile.class_name} {profile.section_name} ·
            Roll {profile.roll_no} · AY {profile.academic_year_name}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {profile.dob && <span>DOB {profile.dob} · </span>}
            {profile.gender && <span>{profile.gender} · </span>}
            {profile.blood_group && <span>{profile.blood_group}</span>}
          </div>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          title="Attendance"
          value={
            profile.attendance.attendance_percent != null
              ? `${profile.attendance.attendance_percent}%`
              : "—"
          }
          sub={`${profile.attendance.days_marked} day(s) marked`}
        />
        <Stat
          title="Last exam grade"
          value={profile.exams[0]?.overall_grade ?? "—"}
          sub={
            profile.exams[0]
              ? `${profile.exams[0].exam_name} · ${profile.exams[0].percentage}%`
              : "No published exam yet"
          }
        />
        <Stat
          title="Recent homework"
          value={String(profile.homework_recent.length)}
          sub={
            profile.homework_recent.length > 0
              ? `Latest due ${profile.homework_recent[0].due_date}`
              : "None"
          }
        />
        <Stat
          title="Pending fees"
          value={`₹${profile.fees_pending_amount.toLocaleString("en-IN")}`}
          sub={profile.fees_pending_amount > 0 ? "Outstanding" : "All cleared"}
          tone={profile.fees_pending_amount > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Attendance breakdown</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">Present</dt>
              <dd className="text-right font-medium">
                {profile.attendance.days_present}
              </dd>
              <dt className="text-slate-500">Absent</dt>
              <dd className="text-right font-medium">
                {profile.attendance.days_absent}
              </dd>
              <dt className="text-slate-500">Late</dt>
              <dd className="text-right font-medium">
                {profile.attendance.days_late}
              </dd>
              <dt className="text-slate-500">Half day</dt>
              <dd className="text-right font-medium">
                {profile.attendance.days_half_day}
              </dd>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exam performance</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {profile.exams.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-500">
                No published exams yet.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-surface-border text-[13px]">
                <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                  <tr>
                    <th className="px-4 py-3 font-bold">Exam</th>
                    <th className="px-4 py-3 text-right font-medium">%</th>
                    <th className="px-4 py-3 text-center font-medium">Grade</th>
                    <th className="px-4 py-3 text-center font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profile.exams.map((e) => (
                    <tr key={e.exam_id}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{e.exam_name}</div>
                        <div className="text-xs text-slate-500">
                          {e.exam_kind.replace(/_/g, " ")}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{e.percentage}%</td>
                      <td className="px-4 py-3 text-center">
                        <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                          {e.overall_grade}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge tone={e.is_pass ? "emerald" : "rose"}>
                          {e.is_pass ? "Pass" : "Fail"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent behaviour</CardTitle>
          </CardHeader>
          <CardBody>
            {profile.behaviour_recent.length === 0 ? (
              <div className="text-sm text-slate-500">No ratings recorded yet.</div>
            ) : (
              <ul className="space-y-3">
                {profile.behaviour_recent.map((b) => (
                  <li
                    key={b.id}
                    className="rounded border border-slate-100 px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-500">
                        {b.period_kind} · {b.period_key}
                      </div>
                      <div className="text-sm font-semibold text-brand-700">
                        ★ {b.average}/5
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      Punct {b.punctuality} · Part {b.participation} · Disc{" "}
                      {b.discipline} · Resp {b.respect}
                    </div>
                    {b.teacher_note && (
                      <p className="mt-1.5 text-[13px] text-ink-muted">
                        {b.teacher_note}
                      </p>
                    )}
                    {b.rated_by_name && (
                      <div className="mt-1 text-xs text-slate-400">
                        — {b.rated_by_name}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent homework</CardTitle>
          </CardHeader>
          <CardBody>
            {profile.homework_recent.length === 0 ? (
              <div className="text-sm text-slate-500">None posted yet.</div>
            ) : (
              <ul className="space-y-2">
                {profile.homework_recent.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between rounded border border-slate-100 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium text-slate-900">{h.title}</div>
                      <div className="text-xs text-slate-500">
                        {h.subject_name} · due {h.due_date}
                      </div>
                    </div>
                    {h.is_past_due ? (
                      <Badge tone="neutral">past due</Badge>
                    ) : (
                      <Badge tone="brand">{h.subject_code}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {showParentContacts && (
        <Card>
          <CardHeader>
            <CardTitle>Parents & guardians</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {profile.parents.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-500">
                No parent linked.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-surface-border text-[13px]">
                <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                  <tr>
                    <th className="px-4 py-3 font-bold">Name</th>
                    <th className="px-4 py-3 font-bold">Relation</th>
                    <th className="px-4 py-3 font-bold">Email</th>
                    <th className="px-4 py-3 font-bold">Phone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profile.parents.map((p) => (
                    <tr key={p.user_id}>
                      <td className="px-4 py-3 font-medium">{p.full_name}</td>
                      <td className="px-4 py-3 text-slate-600">{p.relation}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {p.email ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {p.phone ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}

      {profile.address && (
        <Card>
          <CardHeader>
            <CardTitle>Address</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="whitespace-pre-line text-sm text-slate-700">
              {profile.address}
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Stat({
  title,
  value,
  sub,
  tone = "default",
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: "default" | "ok" | "warn";
}) {
  const valueClass =
    tone === "warn"
      ? "text-amber-600"
      : tone === "ok"
        ? "text-emerald-600"
        : "text-slate-900";
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">{title}</div>
        <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
        {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
      </CardBody>
    </Card>
  );
}
