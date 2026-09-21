// NEW-031 · Period Attendance Gaps
// Module: Student Attendance · Role: School Admin · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/school/attendance-ops/periods/gaps?section_id&date (each section for "All sections"), /school/academic-years, /school/classes, /school/profile (school day). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PeriodGaps } from "@/features/attendance/PeriodGaps";

export const metadata = { title: "NEW-031 · Period Attendance Gaps · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-031">
      <Suspense>
        <PeriodGaps />
      </Suspense>
    </AppShell>
  );
}
