// SCR-266 · Student Strength Report
// Module: Reports & Analytics · Role: School Admin · Release: MVP · Stories: US-0531 / US-0532
// Mock: screens/SCR-266_Student_Strength_Report.html
// Wired: GET /api/v1/school/analytics/strength, /academic-years. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { StrengthReport } from "@/features/reports/people";

export const metadata = { title: "SCR-266 · Student Strength Report · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-266" actions={<ExportButtons />}>
      <Suspense>
        <StrengthReport />
      </Suspense>
    </AppShell>
  );
}
