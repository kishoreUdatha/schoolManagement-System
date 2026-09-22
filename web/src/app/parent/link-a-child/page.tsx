// PM-004 · Link a child
// Parent app · Module: Access · Release: MVP · ERP: SCR-074
// Feature: Request a verified relationship to an existing student.
// Mock: Parent_Mobile_58_Screens/screens/PM-004_link_a_child.html
// Wired: GET /api/v1/parent/me/children (via useParent, "Check again"). Hand-maintained.
// Not wired: the link request form — no self-linking endpoint; the school links children, so the pack's pending-verification state is shown.

import { ParentShell } from "@/components/parent/ParentShell";
import { LinkChild } from "@/features/parent/access/LinkChild";

export const metadata = { title: "PM-004 · Link a child · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={4}>
      <LinkChild />
    </ParentShell>
  );
}
