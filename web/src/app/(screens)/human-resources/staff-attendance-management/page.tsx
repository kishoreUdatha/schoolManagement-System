// SCR-179 · Staff Attendance Management
// Module: HR / Leave / Payroll · Role: HR · Release: Phase 3 · Stories: US-0357 / US-0358
// Mock: screens/SCR-179_Staff_Attendance_Management.html
// Backend: the old frontend served this at /school/staff-attendance — Check in and out with override
// Wired: GET /api/v1/school/staff?status=active, GET /staff-attendance?date=, POST /staff-attendance/override. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { StaffAttendance } from "@/features/hr/StaffAttendance";

export const metadata = { title: "SCR-179 · Staff Attendance Management · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-179" actions={<button type="submit" form="staff-register" className="btn primary">
        <Icon name="check" className="sm" />
        Save attendance
      </button>}>
      <Suspense>
        <StaffAttendance />
      </Suspense>
    </AppShell>
  );
}
