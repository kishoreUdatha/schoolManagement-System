// PM-045 · New request
// Parent app · Module: Support · Release: MVP · ERP: SCR-017 / SCR-253
// Feature: Raise a categorized question or correction request with attachment.
// Mock: Parent_Mobile_58_Screens/screens/PM-045_new_request.html
// Wired: GET /api/v1/parent/me/children/{id}/teacher-contacts, POST /api/v1/parent/me/conversations, GET /api/v1/parent/me/children/{id}/hostel, POST /api/v1/parent/me/children/{id}/hostel/complaints. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { NewRequest } from "@/features/parent/support/NewRequest";

export const metadata = { title: "PM-045 · New request · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={45}>
      <NewRequest />
    </ParentShell>
  );
}
