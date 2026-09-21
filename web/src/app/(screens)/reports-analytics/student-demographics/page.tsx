// SCR-267 · Student Demographics
// Module: Reports & Analytics · Role: School Admin · Release: MVP · Stories: US-0533 / US-0534
// Mock: screens/SCR-267_Student_Demographics.html
// Wired: GET /api/v1/school/analytics/demographics. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { DemographicsReport } from "@/features/reports/people";

export const metadata = { title: "SCR-267 · Student Demographics · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-267" actions={<ExportButtons labels={["Export report"]} />}>
      <Suspense>
        <DemographicsReport />
      </Suspense>
    </AppShell>
  );
}
