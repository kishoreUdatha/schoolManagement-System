// SCR-265 · Admission Reports
// Module: Reports & Analytics · Role: School Admin · Release: MVP · Stories: US-0529 / US-0530
// Mock: screens/SCR-265_Admission_Reports.html
// Wired: GET /api/v1/school/admissions/applications/funnel, /academic-years. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { AdmissionReport } from "@/features/reports/people";

export const metadata = { title: "SCR-265 · Admission Reports · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-265" actions={<ExportButtons />}>
      <Suspense>
        <AdmissionReport />
      </Suspense>
    </AppShell>
  );
}
