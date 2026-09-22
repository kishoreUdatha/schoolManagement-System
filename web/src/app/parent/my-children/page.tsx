// PM-005 · My children
// Parent app · Module: Access · Release: MVP · ERP: SCR-068 / SCR-074
// Feature: Switch among verified linked children without mixing records.
// Mock: Parent_Mobile_58_Screens/screens/PM-005_my_children.html
// Wired: GET /api/v1/parent/me/children (useParent; setChild switches), GET /api/v1/branding/me (school name). Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { MyChildren } from "@/features/parent/access/MyChildren";

export const metadata = { title: "PM-005 · My children · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={5}>
      <MyChildren />
    </ParentShell>
  );
}
