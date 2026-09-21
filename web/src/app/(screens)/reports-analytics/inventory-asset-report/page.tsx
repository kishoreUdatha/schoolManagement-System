// SCR-281 · Inventory & Asset Report
// Module: Reports & Analytics · Role: School Admin · Release: Phase 3 · Stories: US-0561 / US-0562
// Mock: screens/SCR-281_Inventory_Asset_Report.html
// Wired: GET /api/v1/school/analytics/inventory. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { InventoryReport } from "@/features/reports/operations";

export const metadata = { title: "SCR-281 · Inventory & Asset Report · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-281" actions={<ExportButtons />}>
      <Suspense>
        <InventoryReport />
      </Suspense>
    </AppShell>
  );
}
