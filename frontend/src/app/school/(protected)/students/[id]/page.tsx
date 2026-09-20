"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  StudentProfile,
  StudentProfileView,
} from "@/components/StudentProfileView";
import { ClassHistory, Guardians } from "@/components/foundation/Guardians";
import { api, apiError } from "@/lib/api";

export default function SchoolStudentProfilePage() {
  const params = useParams<{ id: string }>();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<StudentProfile>(`/api/v1/school/students/${params.id}`)
      .then((r) => setProfile(r.data))
      .catch((e) => setError(apiError(e)));
  }, [params.id]);

  if (error)
    return (
      <div className="space-y-4">
        <Link
          href="/school/students"
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back to students
        </Link>
        <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      </div>
    );
  if (!profile) return <div className="text-sm text-slate-500">Loading…</div>;

  return (
    <div className="space-y-4">
      <Link
        href="/school/students"
        className="text-sm text-brand-700 hover:underline"
      >
        ← Back to students
      </Link>
      <StudentProfileView profile={profile} showParentContacts={true} />
      <Guardians mode="school" base={`/api/v1/school/students/${params.id}/guardians`} />
      <ClassHistory studentId={params.id} />
    </div>
  );
}
