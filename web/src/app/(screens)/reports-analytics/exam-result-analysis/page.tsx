// SCR-272 · Exam Result Analysis
// Module: Reports & Analytics · Role: School Admin · Release: Phase 2 · Stories: US-0543 / US-0544
// Mock: screens/SCR-272_Exam_Result_Analysis.html
// Wired: GET /api/v1/school/exams, GET /api/v1/school/analytics/exams/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { ExamReport } from "@/features/reports/exams";

export const metadata = { title: "SCR-272 · Exam Result Analysis · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-272" actions={<ExportButtons labels={["Export", "Export analysis"]} />}>
      <Suspense>
        <ExamReport view="result" />
      </Suspense>
    </AppShell>
  );
}
