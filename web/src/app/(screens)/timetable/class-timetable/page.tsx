// SCR-125 · Class Timetable
// Module: Timetable & Substitution · Role: Academic Coordinator · Release: Phase 2 · Stories: US-0249 / US-0250
// Mock: screens/SCR-125_Class_Timetable.html
// Wired: GET /api/v1/school/sections/{id}/timetable (office, ?section=); GET /parent/me/children, /parent/me/children/{id}/timetable (parent). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PrintButton } from "@/features/timetable/shared";
import { SectionWeek } from "@/features/timetable/SectionWeek";

export const metadata = { title: "SCR-125 · Class Timetable · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-125" actions={<PrintButton />}>
      <Suspense>
        <SectionWeek mode="view" />
      </Suspense>
    </AppShell>
  );
}
