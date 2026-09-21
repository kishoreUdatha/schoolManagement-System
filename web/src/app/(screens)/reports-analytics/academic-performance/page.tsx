// SCR-270 · Academic Performance
// Module: Reports & Analytics · Role: School Admin · Release: Phase 2 · Stories: US-0539 / US-0540
// Mock: screens/SCR-270_Academic_Performance.html
// Wired: GET /api/v1/school/exams, GET /api/v1/school/analytics/exams/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { ExamReport } from "@/features/reports/exams";

export const metadata = { title: "SCR-270 · Academic Performance · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-270" actions={<ExportButtons />}>
      <Suspense>
        <ExamReport view="academic" />
      </Suspense>
    </AppShell>
  );
}
