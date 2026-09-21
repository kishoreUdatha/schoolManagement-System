// SCR-248 · Event Details & Participants
// Module: Events / PTM / Communication · Role: School Admin · Release: MVP · Stories: US-0495 / US-0496
// Mock: screens/SCR-248_Event_Details_Participants.html
// Backend: the old frontend served this at /school/events/[id] — Attendance kept apart from consent; unticked is not absent
// Wired: GET /api/v1/school/events (?id=), GET/POST /api/v1/school/event-ops/events/{id}/register. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { EventDetails, ManageParticipantsLink } from "@/features/communication/EventDetails";

export const metadata = { title: "SCR-248 · Event Details & Participants · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-248" actions={<Suspense><ManageParticipantsLink /></Suspense>}>
      <Suspense>
        <EventDetails />
      </Suspense>
    </AppShell>
  );
}
