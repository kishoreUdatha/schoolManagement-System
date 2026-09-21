// SCR-123 · Teacher Availability
// Module: Timetable & Substitution · Role: Academic Coordinator · Release: MVP · Stories: US-0245 / US-0246
// Mock: screens/SCR-123_Teacher_Availability.html
// Wired: GET /api/v1/school/directory/staff, /periods, /cover/unavailability; POST /cover/unavailability, DELETE /cover/unavailability/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { HeadButton } from "@/features/timetable/shared";
import { BLOCK_EVENT } from "@/features/timetable/events";
import { TeacherAvailability } from "@/features/timetable/TeacherAvailability";

export const metadata = { title: "SCR-123 · Teacher Availability · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-123" actions={<HeadButton event={BLOCK_EVENT}>Set availability</HeadButton>}>
      <Suspense>
        <TeacherAvailability />
      </Suspense>
    </AppShell>
  );
}
