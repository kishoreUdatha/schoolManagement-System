// SCR-075 · Communication Preferences
// Module: Parents & Guardians · Role: School Admin · Release: Phase 2 · Stories: US-0149 / US-0150
// Mock: screens/SCR-075_Communication_Preferences.html
// Backend: the old frontend served this at /parent/preferences — Opt-out, and attendance and fees cannot be silenced
// Wired: GET + PUT /api/v1/parent/me/preferences (parent), /api/v1/school/parents/{id}/preferences (staff, ?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { CommunicationPreferences } from "@/features/parents/CommunicationPreferences";

export const metadata = { title: "SCR-075 · Communication Preferences · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-075">
      <Suspense>
        <CommunicationPreferences />
      </Suspense>
    </AppShell>
  );
}
