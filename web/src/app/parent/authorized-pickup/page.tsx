// PM-049 · Authorized pickup
// Parent app · Module: Health & safety · Release: Phase 2 · ERP: SCR-225 / SCR-231
// Feature: Manage school-approved people authorized to collect the child.
// Mock: Parent_Mobile_58_Screens/screens/PM-049_authorized_pickup.html
// Wired: GET/POST /api/v1/parent/me/children/{id}/guardians, DELETE …/guardians/{guardian}. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { AuthorizedPickup } from "@/features/parent/wellbeing/AuthorizedPickup";

export const metadata = { title: "PM-049 · Authorized pickup · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={49}>
      <AuthorizedPickup />
    </ParentShell>
  );
}
