// SCR-275 · Finance Summary
// Module: Reports & Analytics · Role: School Admin · Release: Phase 3 · Stories: US-0549 / US-0550
// Mock: screens/SCR-275_Finance_Summary.html
// Wired: GET /api/v1/school/accounts/cash-book (period and the one before). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { FinanceSummary } from "@/features/reports/money";

export const metadata = { title: "SCR-275 · Finance Summary · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-275" actions={<ExportButtons labels={["Export report"]} />}>
      <Suspense>
        <FinanceSummary />
      </Suspense>
    </AppShell>
  );
}
