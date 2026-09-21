// SCR-108 · Academic Calendar
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: Phase 3 · Stories: US-0215 / US-0216
// Mock: screens/SCR-108_Academic_Calendar.html
// Wired: GET /api/v1/school/calendar (start, end). Events are added on SCR-247. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { AcademicCalendar } from "@/features/academics/AcademicCalendar";

export const metadata = { title: "SCR-108 · Academic Calendar · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-108"
      actions={
        <Link href="/communication/create-edit-event" className="btn primary">
          <Icon name="plus" className="sm" />
          Add academic event
        </Link>
      }
    >
      <Suspense>
        <AcademicCalendar />
      </Suspense>
    </AppShell>
  );
}
