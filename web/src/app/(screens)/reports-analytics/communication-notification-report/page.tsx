// SCR-282 · Communication / Notification Report
// Module: Reports & Analytics · Role: School Admin · Release: Phase 3 · Stories: US-0563 / US-0564
// Mock: screens/SCR-282_Communication_Notification_Report.html
// Wired: GET /api/v1/school/analytics/notifications. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { NotificationReport } from "@/features/reports/operations";

export const metadata = { title: "SCR-282 · Communication / Notification Report · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-282" actions={<ExportButtons />}>
      <Suspense>
        <NotificationReport />
      </Suspense>
    </AppShell>
  );
}
