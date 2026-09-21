// SCR-271 · Subject Performance
// Module: Reports & Analytics · Role: School Admin · Release: Phase 2 · Stories: US-0541 / US-0542
// Mock: screens/SCR-271_Subject_Performance.html
// Wired: GET /api/v1/school/exams, GET /api/v1/school/analytics/exams/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { ExamReport } from "@/features/reports/exams";

export const metadata = { title: "SCR-271 · Subject Performance · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-271" actions={<ExportButtons />}>
      <Suspense>
        <ExamReport view="subject" />
      </Suspense>
    </AppShell>
  );
}
