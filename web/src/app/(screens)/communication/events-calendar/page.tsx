// SCR-246 · Events Calendar
// Module: Events / PTM / Communication · Role: School Admin · Release: MVP · Stories: US-0491 / US-0492
// Mock: screens/SCR-246_Events_Calendar.html
// Backend: the old frontend served this at /school/calendar — Month grid and agenda across sources
// Wired: GET /api/v1/school/calendar (staff), GET /api/v1/parent/me/calendar (parent). Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { EventsCalendar } from "@/features/communication/EventsCalendar";

export const metadata = { title: "SCR-246 · Events Calendar · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-246" actions={<Link href="/communication/create-edit-event" className="btn primary">
        <Icon name="plus" className="sm" />
        Create event
      </Link>}>
      <EventsCalendar />
    </AppShell>
  );
}
