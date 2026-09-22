// SCR-073 · Parent Profile
// Module: Parents & Guardians · Role: School Admin · Release: MVP · Stories: US-0145 / US-0146
// Mock: screens/SCR-073_Parent_Profile.html
// Backend: the old frontend served this at /school/parents/[id] — Profile, linked children, activate and reset
// Wired: GET /api/v1/school/parents/{id} (?id=), /students/{id} per child, /audit-log. The header stays and ?tab= swaps the content (children, access, interactions, payments, activity). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ParentProfile, ParentProfileActions } from "@/features/parents/ParentProfile";

export const metadata = { title: "SCR-073 · Parent Profile · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-073"
      actions={
        <Suspense>
          <ParentProfileActions />
        </Suspense>
      }
    >
      <Suspense>
        <ParentProfile />
      </Suspense>
    </AppShell>
  );
}
