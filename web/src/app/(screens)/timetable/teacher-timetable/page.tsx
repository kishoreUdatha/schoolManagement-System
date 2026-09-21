// SCR-126 · Teacher Timetable
// Module: Timetable & Substitution · Role: Academic Coordinator · Release: Phase 2 · Stories: US-0251 / US-0252
// Mock: screens/SCR-126_Teacher_Timetable.html
// Wired: GET /api/v1/teacher/timetable (teacher); GET /api/v1/school/timetable-gen/coordinator?day_of_week=1…6 (office). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PrintButton } from "@/features/timetable/shared";
import { TeacherTimetable } from "@/features/timetable/TeacherTimetable";

export const metadata = { title: "SCR-126 · Teacher Timetable · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-126" actions={<PrintButton />}>
      <Suspense>
        <TeacherTimetable />
      </Suspense>
    </AppShell>
  );
}
