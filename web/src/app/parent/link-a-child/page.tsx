// PM-004 · Link a child
// Parent app · Module: Access · Release: MVP · ERP: SCR-074
// Feature: Request a verified relationship to an existing student.
// Mock: Parent_Mobile_58_Screens/screens/PM-004_link_a_child.html
// Wired: POST /api/v1/parent/me/requests/link-child, GET /parent/me/requests?kind=link_child, POST /requests/{id}/cancel,
// GET /api/v1/parent/me/children (via useParent, "Check again"). The school approves on SCR-074 Link Children. Hand-maintained.

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
