// NEW-051 · Report Card Printing
// Module: Examinations / Marks / Results · Role: School Admin · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /school/grading (report cards)
// Wired: GET /api/v1/school/exams/{exam_id}/sections/{section_id}/remarks, /report-cards.pdf, PUT /school/exams/{exam_id}/students/{student_id}/remark, GET /school/report-card-settings, /school/exams, /school/classes, /academic-years. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ReportCardPrinting } from "@/features/examinations/ReportCardPrinting";

export const metadata = { title: "NEW-051 · Report Card Printing · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-051">
      <Suspense>
        <ReportCardPrinting />
      </Suspense>
    </AppShell>
  );
}
