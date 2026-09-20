"use client";

import { ReportCards } from "@/components/grading/ReportCards";
import { PageHeader } from "@/components/ui/Field";

export default function TeacherReportCardsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Report cards" subtitle="Write remarks and print report cards for your class." />
      <ReportCards mode="teacher" />
    </div>
  );
}
