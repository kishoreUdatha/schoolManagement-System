// SCR-113 · Attendance Correction
// Module: Student Attendance · Role: Class Teacher · Release: MVP · Stories: US-0225 / US-0226
// Mock: screens/SCR-113_Attendance_Correction.html
// Wired: GET + POST /api/v1/school/attendance-ops/corrections, POST …/corrections/{id}/decide, GET /school/students (picker). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Corrections } from "@/features/attendance/Corrections";
import { PageAction } from "@/features/attendance/shared";
import { EV } from "@/features/attendance/types";

export const metadata = { title: "SCR-113 · Attendance Correction · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-113"
      actions={
        <PageAction event={EV.approveCorrection} icon="check" primary>
          Approve correction
        </PageAction>
      }
    >
      <Suspense>
        <Corrections />
      </Suspense>
    </AppShell>
  );
}
