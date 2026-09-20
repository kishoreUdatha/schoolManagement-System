"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  StudentProfile,
  StudentProfileView,
} from "@/components/StudentProfileView";
import { api, apiError } from "@/lib/api";

export default function TeacherStudentProfilePage() {
  const params = useParams<{ id: string }>();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<StudentProfile>(`/api/v1/teacher/students/${params.id}`)
      .then((r) => setProfile(r.data))
      .catch((e) => setError(apiError(e)));
  }, [params.id]);

  if (error)
    return (
      <div className="space-y-4">
        <Link href="/teacher" className="text-sm text-brand-700 hover:underline">
          ← Back
        </Link>
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      </div>
    );
  if (!profile) return <div className="text-sm text-slate-500">Loading…</div>;

  return (
    <div className="space-y-4">
      <Link href="/teacher" className="text-sm text-brand-700 hover:underline">
        ← Back
      </Link>
      <StudentProfileView profile={profile} showParentContacts={true} />
    </div>
  );
}
