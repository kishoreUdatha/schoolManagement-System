// SCR-090 · Performance & Classroom Observation
// Module: Teachers & Staff · Role: School Admin · Release: Phase 3 · Stories: US-0179 / US-0180
// Mock: screens/SCR-090_Performance_Classroom_Observation.html
// Wired: POST /api/v1/school/staff-ops/observations, GET …/observations?staff_id=, POST …/observations/{id}/share, GET /staff, /classes, /classes/{id}/subjects. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ClassroomObservation } from "@/features/staff/ClassroomObservation";

export const metadata = { title: "SCR-090 · Performance & Classroom Observation · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-090"
      actions={
        <button type="submit" form="observation-form" className="btn primary">
          <Icon name="check" className="sm" />
          Save observation
        </button>
      }
    >
      <Suspense>
        <ClassroomObservation />
      </Suspense>
    </AppShell>
  );
}
