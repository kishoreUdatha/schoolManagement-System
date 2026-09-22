// PM-013 · Leave request detail
// Parent app · Module: Attendance & leave · Release: MVP · ERP: SCR-114 / SCR-115
// Feature: View leave status and approval history.
// Mock: Parent_Mobile_58_Screens/screens/PM-013_leave_request_detail.html
// Wired: GET /api/v1/parent/me/children/{id}/leaves (record ?id= from the list; no single-leave GET), POST …/leaves/{leave_id}/cancel. Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { LeaveRequestDetail } from "@/features/parent/attendance/Leave";

export const metadata = { title: "PM-013 · Leave request detail · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={13}>
      <Suspense>
        <LeaveRequestDetail />
      </Suspense>
    </ParentShell>
  );
}
