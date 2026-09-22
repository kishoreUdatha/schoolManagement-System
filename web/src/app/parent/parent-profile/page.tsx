// PM-047 · Parent profile
// Parent app · Module: Account · Release: MVP · ERP: SCR-073 / SCR-068
// Feature: Manage own contact details and verified child relationships.
// Mock: Parent_Mobile_58_Screens/screens/PM-047_parent_profile.html
// Wired: GET /api/v1/parent/auth/me, children from GET /api/v1/parent/me/children (ParentShell). Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { ParentProfile } from "@/features/parent/account/ParentProfile";

export const metadata = { title: "PM-047 · Parent profile · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={47}>
      <ParentProfile />
    </ParentShell>
  );
}
