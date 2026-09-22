// NEW-090 · My Attendance
// Module: HR / Leave / Payroll · Role: Staff · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /teacher/my-attendance (check in, check out, month history)
// Wired: GET /api/v1/staff/attendance/today, POST /staff/attendance/check-in, POST /staff/attendance/check-out, GET /staff/attendance/history (?year=&month=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { RoleGate } from "@/features/self/kit";
import { EMPLOYEES } from "@/features/self/roles";
import { MyAttendance } from "@/features/self/MyAttendance";

export const metadata = { title: "NEW-090 · My Attendance · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-090"
    >
      <RoleGate roles={EMPLOYEES} message="My Attendance is for school employees who check in: teachers, staff, the principal and the accountant. Sign in with an employee login to use it.">
        <Suspense>
          <MyAttendance />
        </Suspense>
      </RoleGate>
    </AppShell>
  );
}
