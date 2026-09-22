// PM-009 · Attendance
// Parent app · Module: Attendance & leave · Release: MVP · ERP: SCR-060 / SCR-117
// Feature: View attendance calendar and monthly totals.
// Mock: Parent_Mobile_58_Screens/screens/PM-009_attendance.html
// Wired: GET /api/v1/parent/me/children/{id}/attendance/month (?month), …/profile (year totals). Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { Attendance } from "@/features/parent/attendance/Attendance";

export const metadata = { title: "PM-009 · Attendance · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={9}>
      <Attendance />
    </ParentShell>
  );
}
