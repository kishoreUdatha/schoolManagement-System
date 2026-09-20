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
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Timetable →
            </Link>
            <Link
              href={`/parent/children/${params.id}/fees`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Fees →
            </Link>
            <Link
              href={`/parent/children/${params.id}/homework`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Homework →
            </Link>
            <Link
              href={`/parent/children/${params.id}/behaviour`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Behaviour →
            </Link>
            <Link
              href={`/parent/children/${params.id}/exams`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Exams →
            </Link>
            <Link
              href={`/parent/children/${params.id}/videos`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Learning videos →
            </Link>
            <Link
              href={`/parent/children/${params.id}/transport`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Transport →
            </Link>
            <Link
              href={`/parent/children/${params.id}/documents`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Documents & certificates →
            </Link>
            <Link
              href={`/parent/children/${params.id}/library`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Library →
            </Link>
            <Link
              href={`/parent/children/${params.id}/health`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Health →
            </Link>
            <Link
              href={`/parent/children/${params.id}/pickup`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Early pickup →
            </Link>
            <Link
              href={`/parent/children/${params.id}/hostel`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Hostel →
            </Link>
            <Link
              href={`/parent/children/${params.id}/family`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Family &amp; pickup →
            </Link>
            <Link
              href={`/parent/children/${params.id}/syllabus`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Syllabus progress →
            </Link>
            <Link
              href={`/parent/children/${params.id}/tests`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Online tests →
            </Link>
            <Link
              href={`/parent/children/${params.id}/leave`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Apply for leave →
            </Link>
            <Link
              href={`/parent/children/${params.id}/discipline`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              School incidents →
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
