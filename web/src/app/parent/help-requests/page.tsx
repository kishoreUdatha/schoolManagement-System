// PM-044 · Help & requests
// Parent app · Module: Support · Release: MVP · ERP: SCR-017 / SCR-253
// Feature: Track parent queries with category, ownership and replies.
// Mock: Parent_Mobile_58_Screens/screens/PM-044_help_requests.html
// Wired: GET /api/v1/parent/me/conversations (this child's). Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { HelpRequests } from "@/features/parent/support/HelpRequests";

export const metadata = { title: "PM-044 · Help & requests · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={44}>
      <HelpRequests />
    </ParentShell>
  );
}
