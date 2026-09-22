// PM-037 · School calendar
// Parent app · Module: Events & PTM · Release: MVP · ERP: SCR-108 / SCR-246
// Feature: View holidays, assessments, school events and appointments.
// Mock: Parent_Mobile_58_Screens/screens/PM-037_school_calendar.html
// Wired: GET /api/v1/parent/me/calendar (?start, ?end). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { SchoolCalendar } from "@/features/parent/events/SchoolCalendar";

export const metadata = { title: "PM-037 · School calendar · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={37}>
      <Suspense>
        <SchoolCalendar />
      </Suspense>
    </ParentShell>
  );
}
