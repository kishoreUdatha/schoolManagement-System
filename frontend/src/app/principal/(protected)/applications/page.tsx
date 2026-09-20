"use client";

import { Applications } from "@/components/admissions/Applications";
import { PageHeader } from "@/components/ui/Field";

export default function PrincipalApplicationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Admission applications" subtitle="Applications in progress across the school." />
      <Applications canDecide={false} />
    </div>
  );
}
