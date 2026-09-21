// SCR-279 · Transport Utilization
// Module: Reports & Analytics · Role: School Admin · Release: Phase 3 · Stories: US-0557 / US-0558
// Mock: screens/SCR-279_Transport_Utilization.html
// Wired: GET /api/v1/school/analytics/transport. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { TransportReport } from "@/features/reports/operations";

export const metadata = { title: "SCR-279 · Transport Utilization · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-279" actions={<ExportButtons />}>
      <Suspense>
        <TransportReport />
      </Suspense>
    </AppShell>
  );
}
