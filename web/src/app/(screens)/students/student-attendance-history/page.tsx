// SCR-060 · Student Attendance History
// Module: Students · Role: School Admin · Release: MVP · Stories: US-0119 / US-0120
// Mock: screens/SCR-060_Student_Attendance_History.html
// Wired: GET /api/v1/school/reports/attendance/students/{id}, /students/{id} (?id=). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { StudentAttendance } from "@/features/students/StudentAttendance";

export const metadata = { title: "SCR-060 · Student Attendance History · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-060"
      actions={
        <Link href="/attendance/attendance-correction" className="btn primary">
          <Icon name="arrow" className="sm" />
          Request correction
        </Link>
      }
    >
      <Suspense>
        <StudentAttendance />
      </Suspense>
    </AppShell>
  );
}
