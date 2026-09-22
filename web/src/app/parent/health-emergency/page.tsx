// PM-043 · Health & emergency
// Parent app · Module: Health & safety · Release: MVP · ERP: SCR-065 / SCR-217 / SCR-220 / SCR-225
// Feature: View parent-visible health information and request updates to allergies or emergency contacts.
// Mock: Parent_Mobile_58_Screens/screens/PM-043_health_emergency.html
// Wired: GET /api/v1/parent/me/children/{id}/health, PUT /api/v1/parent/me/children/{id}/health/profile. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { HealthEmergency } from "@/features/parent/wellbeing/HealthEmergency";

export const metadata = { title: "PM-043 · Health & emergency · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={43}>
      <HealthEmergency />
    </ParentShell>
  );
}
