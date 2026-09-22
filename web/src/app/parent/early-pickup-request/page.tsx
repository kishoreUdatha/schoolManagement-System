// PM-050 · Early pickup request
// Parent app · Module: Health & safety · Release: Phase 2 · ERP: SCR-231 / SCR-116
// Feature: Request early departure and approved pickup without bypassing school gate checks.
// Mock: Parent_Mobile_58_Screens/screens/PM-050_early_pickup_request.html
// Wired: GET/POST /api/v1/parent/me/children/{id}/gate-passes, POST …/gate-passes/{id}/cancel, GET /api/v1/parent/me/children/{id}/guardians. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { EarlyPickup } from "@/features/parent/wellbeing/EarlyPickup";

export const metadata = { title: "PM-050 · Early pickup request · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={50}>
      <EarlyPickup />
    </ParentShell>
  );
}
