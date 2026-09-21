// SCR-124 · Generate Timetable
// Module: Timetable & Substitution · Role: Academic Coordinator · Release: Phase 2 · Stories: US-0247 / US-0248
// Mock: screens/SCR-124_Generate_Timetable.html
// Wired: GET /api/v1/school/timetable-gen/sections/{id}/requirements, PUT /timetable-gen/class-subjects/{id}/periods, POST /timetable-gen/sections/{id}/generate (?section=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { GenerateTimetable } from "@/features/timetable/GenerateTimetable";

export const metadata = { title: "SCR-124 · Generate Timetable · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-124"
      actions={
        <button type="submit" form="generate-form" className="btn primary">
          <Icon name="check" className="sm" />
          Generate timetable
        </button>
      }
    >
      <Suspense>
        <GenerateTimetable />
      </Suspense>
    </AppShell>
  );
}
