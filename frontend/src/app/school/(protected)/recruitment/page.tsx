"use client";

import { Recruitment } from "@/components/hr/Recruitment";
import { PageHeader } from "@/components/ui/Field";

export default function SchoolRecruitmentPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Recruitment" subtitle="Openings, applications, interviews and offers." />
      <Recruitment canEdit={true} />
    </div>
  );
}
