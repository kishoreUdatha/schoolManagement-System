"use client";

import { ReportCards } from "@/components/grading/ReportCards";
import { PageHeader } from "@/components/ui/Field";

export default function PrincipalReportCardsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Report cards" subtitle="Approve results and write the principal's remark." />
      <ReportCards mode="principal" />
    </div>
  );
}
