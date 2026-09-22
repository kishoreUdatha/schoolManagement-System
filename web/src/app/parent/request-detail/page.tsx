// PM-046 · Request detail
// Parent app · Module: Support · Release: MVP · ERP: SCR-017 / SCR-253
// Feature: View request status, assigned team and conversation.
// Mock: Parent_Mobile_58_Screens/screens/PM-046_request_detail.html
// Wired: GET /api/v1/parent/me/conversations, GET/POST …/conversations/{id}/messages, POST …/conversations/{id}/mark-read, POST …/conversations/{id}/resolve (?id=);
// office requests GET /api/v1/parent/me/help-tickets/{id}, POST …/replies, POST …/resolve (?ticket=). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { RequestDetail } from "@/features/parent/support/RequestDetail";

export const metadata = { title: "PM-046 · Request detail · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={46}>
      <Suspense>
        <RequestDetail />
      </Suspense>
    </ParentShell>
  );
}
