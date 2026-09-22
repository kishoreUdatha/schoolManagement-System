// PM-052 · Hostel updates
// Parent app · Module: Optional services · Release: Phase 2 · ERP: SCR-210 / SCR-212 / SCR-213
// Feature: View parent-visible hostel attendance, warden updates and outing requests when enrolled.
// Mock: Parent_Mobile_58_Screens/screens/PM-052_hostel_updates.html
// Wired: GET /api/v1/parent/me/children/{id}/hostel, GET/POST /api/v1/parent/me/children/{id}/hostel/outings, POST …/outings/{id}/cancel, POST /api/v1/parent/me/children/{id}/hostel/complaints. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { HostelUpdates } from "@/features/parent/services/HostelUpdates";

export const metadata = { title: "PM-052 · Hostel updates · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={52}>
      <HostelUpdates />
    </ParentShell>
  );
}
