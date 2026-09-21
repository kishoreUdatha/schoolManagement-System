// SCR-273 · Fee Collection Report
// Module: Reports & Analytics · Role: School Admin · Release: Phase 2 · Stories: US-0545 / US-0546
// Mock: screens/SCR-273_Fee_Collection_Report.html
// Wired: GET /api/v1/school/analytics/fee-collection. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { FeeCollectionReport } from "@/features/reports/money";

export const metadata = { title: "SCR-273 · Fee Collection Report · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-273" actions={<ExportButtons />}>
      <Suspense>
        <FeeCollectionReport />
      </Suspense>
    </AppShell>
  );
}
