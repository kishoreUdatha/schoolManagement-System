// NEW-071 · Health Checkups
// Module: Health / Counselling / Discipline · Role: Nurse · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /school/health/students/[id] — Height, weight, vision, dental check-ups
// Wired: GET /api/v1/school/health/profiles (search), GET /health/students/{id} (?id=), POST /health/students/{id}/checkups, DELETE /health/checkups/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AddCheckupLink, HealthCheckups } from "@/features/health/Checkups";

export const metadata = { title: "NEW-071 · Health Checkups · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-071"
      actions={
        <Suspense>
          <AddCheckupLink />
        </Suspense>
      }
    >
      <Suspense>
        <HealthCheckups />
      </Suspense>
    </AppShell>
  );
}
