// NEW-107 · Health Report
// Module: Health / Counselling / Discipline · Role: Nurse · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/school/health/report?month=. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { HealthReport } from "@/features/health/HealthReport";

export const metadata = { title: "NEW-107 · Health Report · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-107">
      <HealthReport />
    </AppShell>
  );
}
