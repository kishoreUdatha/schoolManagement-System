// SCR-278 · Teacher Performance
// Module: Reports & Analytics · Role: School Admin · Release: Phase 3 · Stories: US-0555 / US-0556
// Mock: screens/SCR-278_Teacher_Performance.html
// Wired: GET /api/v1/school/analytics/teacher-activity. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ExportButtons } from "@/features/reports/kit";
import { TeacherActivity } from "@/features/reports/operations";

export const metadata = { title: "SCR-278 · Teacher Performance · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-278" actions={<ExportButtons />}>
      <Suspense>
        <TeacherActivity />
      </Suspense>
    </AppShell>
  );
}
