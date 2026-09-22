// PM-035 · Inbox
// Parent app · Module: Communication · Release: MVP · ERP: SCR-253
// Feature: View approved parent–teacher and school office conversations.
// Mock: Parent_Mobile_58_Screens/screens/PM-035_inbox.html
// Wired: GET /api/v1/parent/me/conversations, GET /api/v1/parent/me/children/{id}/teacher-contacts, GET /api/v1/parent/me/school-contact (communication hours). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { Inbox } from "@/features/parent/comms/messages";

export const metadata = { title: "PM-035 · Inbox · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={35}>
      <Suspense>
        <Inbox />
      </Suspense>
    </ParentShell>
  );
}
