"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { HealthRecordView } from "@/components/health/HealthRecordView";

export default function StudentHealthPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-4">
      <Link href="/school/health" className="text-sm text-ink-muted hover:underline">
        ← Health
      </Link>
      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Health record</h1>
      <HealthRecordView
        mode="school"
        recordUrl={`/api/v1/school/health/students/${id}`}
        profileUrl={`/api/v1/school/health/students/${id}/profile`}
      />
    </div>
  );
}
