"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { HealthRecordView } from "@/components/health/HealthRecordView";
import { PageHeader } from "@/components/ui/Field";

export default function StudentHealthPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-[18px]">
      <Link href="/school/health" className="text-sm text-ink-muted hover:underline">
        ← Health
      </Link>
      <PageHeader
        title="Health record"
        subtitle="Everything the school holds about this child's health."
      />
      <HealthRecordView
        mode="school"
        recordUrl={`/api/v1/school/health/students/${id}`}
        profileUrl={`/api/v1/school/health/students/${id}/profile`}
      />
    </div>
  );
}
