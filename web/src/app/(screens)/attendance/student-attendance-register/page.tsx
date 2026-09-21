// SCR-112 · Student Attendance Register
// Module: Student Attendance · Role: Teacher · Release: MVP · Stories: US-0223 / US-0224
// Mock: screens/SCR-112_Student_Attendance_Register.html
// Wired: GET /api/v1/school/reports/attendance/student-monthly (+ .csv), GET /school/reports/attendance/students/{id}, /school/classes, /school/profile. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AttendanceRegister } from "@/features/attendance/AttendanceRegister";
import { PageAction } from "@/features/attendance/shared";
import { EV } from "@/features/attendance/types";

export const metadata = { title: "SCR-112 · Student Attendance Register · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-112"
      actions={
        <PageAction event={EV.exportRegister} icon="download" primary>
          Export register
        </PageAction>
      }
    >
      <Suspense>
        <AttendanceRegister />
      </Suspense>
    </AppShell>
  );
}
