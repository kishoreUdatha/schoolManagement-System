// PM-010 · Attendance detail
// Parent app · Module: Attendance & leave · Release: MVP · ERP: SCR-110 / SCR-111 / SCR-116
// Feature: View daily and period attendance with teacher-recorded timestamps.
// Mock: Parent_Mobile_58_Screens/screens/PM-010_attendance_detail.html
// Wired: GET /api/v1/parent/me/children/{id}/profile (attendance breakdown). Hand-maintained.
// Not wired: one day's record, arrival time and period attendance — no parent endpoint for daily or period attendance.

import { ParentShell } from "@/components/parent/ParentShell";
import { AttendanceDetail } from "@/features/parent/attendance/Attendance";

export const metadata = { title: "PM-010 · Attendance detail · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={10}>
      <AttendanceDetail />
    </ParentShell>
  );
}
