"use client";

import { ReportCards } from "@/components/grading/ReportCards";
import { PageHeader } from "@/components/ui/Field";

export default function SchoolReportCardsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Report cards" subtitle="Approve results, add remarks and print report cards." />
      <ReportCards mode="admin" />
    </div>
  );
}
