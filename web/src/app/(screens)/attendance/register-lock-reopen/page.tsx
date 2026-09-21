// NEW-030 · Register Lock & Reopen
// Module: Student Attendance · Role: School Admin · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/school/attendance/registers?date, POST /school/attendance/registers/lock, POST /school/attendance/registers/lock-day?date, POST /school/attendance/registers/reopen, /school/profile (school day). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { RegisterLocks } from "@/features/attendance/RegisterLocks";
import { PageAction } from "@/features/attendance/shared";
import { EV } from "@/features/attendance/types";

export const metadata = { title: "NEW-030 · Register Lock & Reopen · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-030"
      actions={
        <PageAction event={EV.lockDay} icon="shield" primary>
          Lock all marked
        </PageAction>
      }
    >
      <Suspense>
        <RegisterLocks />
      </Suspense>
    </AppShell>
  );
}
