// SCR-116 · Late Entry / Early Exit
// Module: Student Attendance · Role: Teacher · Release: Phase 2 · Stories: US-0231 / US-0232
// Mock: screens/SCR-116_Late_Entry_Early_Exit.html
// Wired: GET + PUT /api/v1/school/attendance-ops/times, GET /school/students (picker). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { LateEarly } from "@/features/attendance/LateEarly";
import { PageAction } from "@/features/attendance/shared";
import { EV } from "@/features/attendance/types";

export const metadata = { title: "SCR-116 · Late Entry / Early Exit · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-116"
      actions={
        <>
          <PageAction event={EV.exportTimes} icon="download">
            Export
          </PageAction>
          <PageAction event={EV.recordTime} icon="check" primary>
            Record entry
          </PageAction>
        </>
      }
    >
      <Suspense>
        <LateEarly />
      </Suspense>
    </AppShell>
  );
}
