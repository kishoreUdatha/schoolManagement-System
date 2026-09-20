"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { HealthRecordView } from "@/components/health/HealthRecordView";

export default function ChildHealthPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-4">
      <Link href={`/parent/children/${id}`} className="text-sm text-brand-700 hover:underline">
        ← Back
      </Link>
      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Health</h1>
      <p className="text-sm text-slate-500">Keep allergies, medication and emergency contacts up to date so the school nurse has them.</p>
      <HealthRecordView
        mode="parent"
        recordUrl={`/api/v1/parent/me/children/${id}/health`}
        profileUrl={`/api/v1/parent/me/children/${id}/health/profile`}
      />
    </div>
  );
}
