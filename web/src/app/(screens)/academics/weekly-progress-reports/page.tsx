// NEW-095 · Weekly Progress Reports
// Module: Academics & Curriculum · Role: Teacher · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /teacher/weekly-reports
// Wired: GET /api/v1/teacher/my-classes, GET /teacher/weekly-reports (?section_id=&week_start=), POST /teacher/weekly-reports/generate, PATCH /teacher/weekly-reports/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageAction, RoleGate } from "@/features/self/kit";
import { TEACHERS } from "@/features/self/roles";
import { WeeklyReports } from "@/features/teacher/WeeklyReports";

export const metadata = { title: "NEW-095 · Weekly Progress Reports · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-095"
      actions={
        <PageAction name="generate" icon="file" roles={TEACHERS}>
          Generate reports
        </PageAction>
      }
    >
      <RoleGate roles={TEACHERS} message="Weekly progress reports are prepared by class teachers from a teacher login.">
        <Suspense>
          <WeeklyReports />
        </Suspense>
      </RoleGate>
    </AppShell>
  );
}
