// SCR-217 · Student Medical Profile
// Module: Health / Counselling / Discipline · Role: Nurse / Medical Officer · Release: Phase 2 · Stories: US-0433 / US-0434
// Mock: screens/SCR-217_Student_Medical_Profile.html
// Backend: the old frontend served this at /school/health/students/[id] — Profile, checkups, immunisations, visits
// Wired: GET /api/v1/school/health/students/{id} (?id=), PUT /health/students/{id}/profile; GET /health/profiles to choose a student. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { MedicalProfile, UpdateProfileLink } from "@/features/health/Clinic";

export const metadata = { title: "SCR-217 · Student Medical Profile · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-217" actions={<Suspense>
        <UpdateProfileLink />
      </Suspense>}>
      <Suspense>
        <MedicalProfile />
      </Suspense>
    </AppShell>
  );
}
