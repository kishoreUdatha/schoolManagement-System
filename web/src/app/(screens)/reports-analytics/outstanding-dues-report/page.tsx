// SCR-274 · Outstanding Dues Report
// Module: Reports & Analytics · Role: School Admin · Release: Phase 3 · Stories: US-0547 / US-0548
// Mock: screens/SCR-274_Outstanding_Dues_Report.html
// Wired: GET /api/v1/school/analytics/dues-ageing. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { DuesReport } from "@/features/reports/money";

export const metadata = { title: "SCR-274 · Outstanding Dues Report · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-274" actions={<ExportButtons />}>
      <Suspense>
        <DuesReport />
      </Suspense>
    </AppShell>
  );
}
