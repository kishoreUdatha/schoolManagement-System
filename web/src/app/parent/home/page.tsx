// PM-006 · Home
// Parent app · Module: Home & profile · Release: MVP · ERP: SCR-037
// Feature: Show selected child’s current attendance, tasks, fees, trip and alerts.
// Mock: Parent_Mobile_58_Screens/screens/PM-006_home.html
// Wired: GET /api/v1/parent/me/children/{id}/profile, …/homework, …/fees, …/transport, …/attendance/day (today's check-in), GET /api/v1/parent/me/ptm, GET /api/v1/branding/me. Hand-maintained.
// Not wired: the live bus ETA — no endpoint.

import { ParentShell } from "@/components/parent/ParentShell";
import { ParentHome } from "@/features/parent/home/ParentHome";

export const metadata = { title: "PM-006 · Home · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={6}>
      <ParentHome />
    </ParentShell>
  );
}
