// PM-012 · Apply for leave
// Parent app · Module: Attendance & leave · Release: MVP · ERP: SCR-114
// Feature: Submit a child-specific leave request to the school.
// Mock: Parent_Mobile_58_Screens/screens/PM-012_apply_for_leave.html
// Wired: POST /api/v1/parent/me/children/{id}/leaves ({kind, from_date, to_date, reason}). Hand-maintained.
// Not wired: supporting document — the leave request takes no attachment.

import { ParentShell } from "@/components/parent/ParentShell";
import { ApplyForLeave } from "@/features/parent/attendance/Leave";

export const metadata = { title: "PM-012 · Apply for leave · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={12}>
      <ApplyForLeave />
    </ParentShell>
  );
}
