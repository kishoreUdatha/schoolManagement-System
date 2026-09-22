// PM-036 · Conversation
// Parent app · Module: Communication · Release: MVP · ERP: SCR-253 / SCR-077
// Feature: Exchange messages and allowed attachments with authorized school staff.
// Mock: Parent_Mobile_58_Screens/screens/PM-036_conversation.html
// Wired: GET/POST /api/v1/parent/me/conversations, GET/POST …/conversations/{id}/messages, POST …/conversations/{id}/mark-read, GET /api/v1/parent/me/children/{id}/teacher-contacts (?id= or ?teacher=). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { ConversationView } from "@/features/parent/comms/messages";

export const metadata = { title: "PM-036 · Conversation · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={36}>
      <Suspense>
        <ConversationView />
      </Suspense>
    </ParentShell>
  );
}
