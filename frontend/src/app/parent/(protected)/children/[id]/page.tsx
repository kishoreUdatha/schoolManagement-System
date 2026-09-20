"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  StudentProfile,
  StudentProfileView,
} from "@/components/StudentProfileView";
import { api, apiError } from "@/lib/api";

export default function ChildDetailPage() {
  const params = useParams<{ id: string }>();
  const [profile, setProfile] = useState<
    (StudentProfile & { relation?: string }) | null
  >(null);
  const [relation, setRelation] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<StudentProfile>(
        `/api/v1/parent/me/children/${params.id}/profile`,
      ),
      api.get<{ relation: string }>(`/api/v1/parent/me/children/${params.id}`),
    ])
      .then(([p, o]) => {
        setProfile(p.data);
        setRelation(o.data.relation);
      })
      .catch((e) => setError(apiError(e)));
  }, [params.id]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/parent" className="text-sm text-brand-700 hover:underline">
          ← Back
        </Link>
        <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      </div>
    );
  }
  if (!profile) return <div className="text-sm text-slate-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <Link href="/parent" className="text-sm text-brand-700 hover:underline">
        ← Back to dashboard
      </Link>

      {relation && (
        <div>
          <Badge tone="brand">{relation}</Badge>
        </div>
      )}

      <StudentProfileView profile={profile} showParentContacts={false} />

      <Card>
        <CardHeader>
          <CardTitle>Explore</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/parent/children/${params.id}/timetable`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Timetable →
            </Link>
            <Link
              href={`/parent/children/${params.id}/fees`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Fees →
            </Link>
            <Link
              href={`/parent/children/${params.id}/homework`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Homework →
            </Link>
            <Link
              href={`/parent/children/${params.id}/behaviour`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Behaviour →
            </Link>
            <Link
              href={`/parent/children/${params.id}/exams`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Exams →
            </Link>
            <Link
              href={`/parent/children/${params.id}/videos`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Learning videos →
            </Link>
            <Link
              href={`/parent/children/${params.id}/resources`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Study material →
            </Link>
            <Link
              href={`/parent/children/${params.id}/transport`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Transport →
            </Link>
            <Link
              href={`/parent/children/${params.id}/documents`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Documents & certificates →
            </Link>
            <Link
              href={`/parent/children/${params.id}/library`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Library →
            </Link>
            <Link
              href={`/parent/children/${params.id}/health`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Health →
            </Link>
            <Link
              href={`/parent/children/${params.id}/pickup`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Early pickup →
            </Link>
            <Link
              href={`/parent/children/${params.id}/hostel`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Hostel →
            </Link>
            <Link
              href={`/parent/children/${params.id}/family`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Family &amp; pickup →
            </Link>
            <Link
              href={`/parent/children/${params.id}/syllabus`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Syllabus progress →
            </Link>
            <Link
              href={`/parent/children/${params.id}/tests`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Online tests →
            </Link>
            <Link
              href={`/parent/children/${params.id}/leave`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              Apply for leave →
            </Link>
            <Link
              href={`/parent/children/${params.id}/discipline`}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
            >
              School incidents →
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
