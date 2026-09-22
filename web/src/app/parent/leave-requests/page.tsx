// PM-011 · Leave requests
// Parent app · Module: Attendance & leave · Release: MVP · ERP: SCR-114 / SCR-115
// Feature: Track leave applications and school decisions.
// Mock: Parent_Mobile_58_Screens/screens/PM-011_leave_requests.html
// Wired: GET /api/v1/parent/me/children/{id}/leaves. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { LeaveRequests } from "@/features/parent/attendance/Leave";

export const metadata = { title: "PM-011 · Leave requests · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={11}>
      <LeaveRequests />
    </ParentShell>
  );
}
