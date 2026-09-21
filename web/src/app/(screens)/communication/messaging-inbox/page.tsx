// SCR-253 · Messaging / Inbox
// Module: Events / PTM / Communication · Role: School Admin · Release: Phase 3 · Stories: US-0505 / US-0506
// Mock: screens/SCR-253_Messaging_Inbox.html
// Backend: the old frontend served this at /school/messages — Who is talking, not what they said; no admin participant exists
// Wired: office/principal GET /api/v1/school/event-ops/conversations; teacher GET /api/v1/teacher/conversations, GET/POST /conversations/{id}/messages, POST /mark-read, PATCH /conversations/{id}; parent the same under /api/v1/parent/me plus POST /parent/me/conversations, GET /parent/me/children, /children/{id}/teacher-contacts. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { MessagingInbox, NewMessageAction } from "@/features/communication/MessagingInbox";

export const metadata = { title: "SCR-253 · Messaging / Inbox · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-253" actions={<NewMessageAction />}>
      <Suspense>
        <MessagingInbox />
      </Suspense>
    </AppShell>
  );
}
