"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeCheck, BookOpen, ChevronLeft, Clock, Users } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Table,
  WarnBox,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { daysLeft, readableDate, shortDate } from "@/lib/dates";

type Qualification = {
  id: number;
  qualification: string;
  institution: string | null;
  year_awarded: number | null;
  subject_area: string | null;
  document_title: string | null;
  verified_at: string | null;
  verified_by: string | null;
};
type Doc = {
  id: number;
  title: string;
  category: string;
  verification_status: string;
  expires_on: string | null;
  uploaded_at: string;
};
type Observation = {
  id: number;
  observed_on: string;
  observer_name: string | null;
  subject_name: string | null;
  section_label: string | null;
  focus: string | null;
  strengths: string | null;
  next_steps: string | null;
  shared_with_staff: boolean;
};
type Profile = {
  staff_id: number;
  user_id: number;
  employee_no: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  designation: string | null;
  joining_date: string | null;
  department_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
  workload: {
    periods_per_week: number;
    subjects_taught: number;
    sections_taught: number;
    class_teacher_of: { section_id: number; label: string }[];
    subjects: { class_subject_id: number; subject_name: string; class_name: string | null }[];
    homework_set: number;
    marks_entered: number;
  };
  qualifications: Qualification[];
  documents: Doc[];
  recent_observations: Observation[];
  exit_clearance_id: number | null;
  exit_status: string | null;
};

/** One member of staff, gathered rather than linked.
 *
 *  The list page could already show a name and a phone number in a modal.
 *  What it could not answer without four separate trips is who this person
 *  is, what they teach, whether their qualifications have been checked, and
 *  whether anything is outstanding.
 */
export default function StaffProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Profile>(`/api/v1/school/staff-ops/${id}/profile`)
      .then((r) => setP(r.data))
      .catch((e) => setError(apiError(e)));
  }, [id]);

  const load = p?.workload;
  const unverified = (p?.qualifications ?? []).filter((q) => !q.verified_at).length;

  return (
    <div className="space-y-6">
      <Link
        href="/school/staff"
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        All staff
      </Link>

      <PageHeader
        title={p?.full_name ?? "Staff member"}
        subtitle={
          p
            ? `${p.employee_no} · ${humanize(p.role)}${p.designation ? ` · ${p.designation}` : ""}`
            : ""
        }
        actions={
          p && (
            <div className="flex flex-wrap gap-2">
              <Link href={`/school/staff/${id}/qualifications`}>
                <Button variant="secondary">Qualifications</Button>
              </Link>
              <Link href={`/school/staff/${id}/exit`}>
                <Button variant="secondary">Leaving</Button>
              </Link>
            </div>
          )
        }
      />
      <ErrorBox>{error}</ErrorBox>

      {p && !p.is_active && (
        <WarnBox>
          This account is switched off, so {p.full_name.split(" ")[0]} cannot sign in.
          Their record and everything they did is kept.
        </WarnBox>
      )}

      <StatStrip
        stats={[
          {
            label: "Periods a week",
            value: load?.periods_per_week ?? "—",
            note: `${load?.sections_taught ?? 0} section(s) taught`,
            icon: Clock,
          },
          {
            label: "Subjects taught",
            value: load?.subjects_taught ?? "—",
            note: "Across every class",
            icon: BookOpen,
          },
          {
            label: "Class teacher of",
            value: load?.class_teacher_of.length ?? "—",
            note: load?.class_teacher_of.map((c) => c.label).join(", ") || undefined,
            icon: Users,
          },
          {
            // The tile used to go amber on anything unchecked. The strip has
            // no accent, so the state is said in words under the figure.
            label: "Unchecked qualifications",
            value: unverified,
            note: unverified ? "Somebody needs to check these" : "All checked",
            icon: BadgeCheck,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <Badge tone={p?.is_active ? "emerald" : "neutral"}>
              {p?.is_active ? "Active" : "Switched off"}
            </Badge>
          </CardHeader>
          <CardBody className="space-y-2 text-[13px]">
            {[
              ["Email", p?.email ?? "—"],
              ["Phone", p?.phone ?? "—"],
              ["Department", p?.department_name ?? "—"],
              ["Joined", p?.joining_date ? readableDate(p.joining_date) : "—"],
              ["Last signed in", p?.last_login_at ? shortDate(p.last_login_at.slice(0, 10)) : "Never"],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-4">
                <span className="font-bold text-ink-muted">{k}</span>
                <span className="text-ink">{v}</span>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What they teach</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <Table
              head={["Subject", "Class"]}
              empty={(load?.subjects.length ?? 0) === 0 && "No subjects assigned yet."}
            >
              {(load?.subjects ?? []).map((s) => (
                <tr key={s.class_subject_id}>
                  <td className={tdStrong}>{s.subject_name}</td>
                  <td className={td}>{s.class_name ?? "—"}</td>
                </tr>
              ))}
            </Table>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Qualifications</CardTitle>
          <Link
            href={`/school/staff/${id}/qualifications`}
            className="text-[13px] font-bold text-brand-600 hover:underline"
          >
            Manage
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Qualification", "Institution", "Year", "Subject", "Checked"]}
            empty={
              (p?.qualifications.length ?? 0) === 0 &&
              "Nothing recorded yet."
            }
          >
            {(p?.qualifications ?? []).map((q) => (
              <tr key={q.id}>
                <td className={tdStrong}>{q.qualification}</td>
                <td className={td}>{q.institution ?? "—"}</td>
                <td className={td}>{q.year_awarded ?? "—"}</td>
                <td className={td}>{q.subject_area ?? "—"}</td>
                <td className={td}>
                  {q.verified_at ? (
                    <Badge tone="emerald">Yes</Badge>
                  ) : (
                    <Badge tone="amber">Not yet</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Title", "Category", "State", "Expires"]}
            empty={(p?.documents.length ?? 0) === 0 && "Nothing uploaded yet."}
          >
            {(p?.documents ?? []).map((d) => {
              const left = daysLeft(d.expires_on);
              return (
                <tr key={d.id}>
                  <td className={tdStrong}>{d.title}</td>
                  <td className={td}>{humanize(d.category)}</td>
                  <td className={td}>
                    <Badge
                      tone={d.verification_status === "verified" ? "emerald" : "amber"}
                    >
                      {humanize(d.verification_status)}
                    </Badge>
                  </td>
                  <td className={td}>
                    {d.expires_on ? (
                      <Badge tone={left !== null && left < 0 ? "rose" : left !== null && left <= 30 ? "amber" : "neutral"}>
                        {readableDate(d.expires_on)}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent lesson observations</CardTitle>
          <Link
            href={`/school/staff/observations?staff_id=${id}`}
            className="text-[13px] font-bold text-brand-600 hover:underline"
          >
            All observations
          </Link>
        </CardHeader>
        <CardBody className="space-y-3">
          {(p?.recent_observations.length ?? 0) === 0 && (
            <p className="text-[13px] text-ink-subtle">
              Nobody has sat in on a lesson yet.
            </p>
          )}
          {(p?.recent_observations ?? []).map((o) => (
            <div key={o.id} className="rounded-[10px] border border-surface-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-ink">
                  {readableDate(o.observed_on)}
                  {o.subject_name ? ` · ${o.subject_name}` : ""}
                  {o.section_label ? ` · ${o.section_label}` : ""}
                </span>
                <Badge tone={o.shared_with_staff ? "emerald" : "neutral"}>
                  {o.shared_with_staff ? "Shared" : "Not shared yet"}
                </Badge>
              </div>
              {o.strengths && (
                <p className="mt-2 text-[13px] text-ink-muted">
                  <span className="font-bold text-ink">What went well: </span>
                  {o.strengths}
                </p>
              )}
              {o.next_steps && (
                <p className="mt-1 text-[13px] text-ink-muted">
                  <span className="font-bold text-ink">To try next: </span>
                  {o.next_steps}
                </p>
              )}
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
