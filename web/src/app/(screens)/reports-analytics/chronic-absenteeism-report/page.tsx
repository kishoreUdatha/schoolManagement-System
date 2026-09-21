// SCR-269 · Chronic Absenteeism Report
// Module: Reports & Analytics · Role: School Admin · Release: Phase 2 · Stories: US-0537 / US-0538
// Mock: screens/SCR-269_Chronic_Absenteeism_Report.html
// Wired: GET /api/v1/school/analytics/chronic-absence. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { ChronicAbsence } from "@/features/reports/attendance";

export const metadata = { title: "SCR-269 · Chronic Absenteeism Report · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-269" actions={<ExportButtons />}>
      <Suspense>
        <ChronicAbsence />
      </Suspense>
    </AppShell>
  );
}
