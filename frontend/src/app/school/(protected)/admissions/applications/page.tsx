"use client";

import { Applications } from "@/components/admissions/Applications";
import { PageHeader } from "@/components/ui/Field";

export default function SchoolApplicationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Admission applications" subtitle="Forms, documents, entrance assessments and admission decisions." />
      <Applications canDecide={true} />
    </div>
  );
}
