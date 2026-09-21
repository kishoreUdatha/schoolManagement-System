// SCR-247 · Create / Edit Event
// Module: Events / PTM / Communication · Role: School Admin · Release: MVP · Stories: US-0493 / US-0494
// Mock: screens/SCR-247_Create_Edit_Event.html
// Backend: the old frontend served this at /school/events — Kind, dates, venue, audience, consent
// Wired: POST /api/v1/school/events, PUT/DELETE /events/{id}, POST /events/{id}/publish|cancel, GET /events (?id=), /classes, /academic-years. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { EventForm } from "@/features/communication/EventForm";

export const metadata = { title: "SCR-247 · Create / Edit Event · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-247" actions={<button type="submit" form="event-form" value="publish" className="btn primary">
        <Icon name="check" className="sm" />
        Publish event
      </button>}>
      <Suspense>
        <EventForm />
      </Suspense>
    </AppShell>
  );
}
