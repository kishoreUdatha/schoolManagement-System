// NEW-109 · Class Attendance
// Module: Student Attendance · Role: Teacher · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/teacher/my-classes, GET /api/v1/teacher/attendance/class-overview. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ClassAttendance } from "@/features/attendance/ClassAttendance";

export const metadata = { title: "NEW-109 · Class Attendance · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-109">
      <ClassAttendance />
    </AppShell>
  );
}
