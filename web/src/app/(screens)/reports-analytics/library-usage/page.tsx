// SCR-280 · Library Usage
// Module: Reports & Analytics · Role: School Admin · Release: Phase 3 · Stories: US-0559 / US-0560
// Mock: screens/SCR-280_Library_Usage.html
// Wired: GET /api/v1/school/analytics/library. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { LibraryReport } from "@/features/reports/operations";

export const metadata = { title: "SCR-280 · Library Usage · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-280" actions={<ExportButtons />}>
      <Suspense>
        <LibraryReport />
      </Suspense>
    </AppShell>
  );
}
