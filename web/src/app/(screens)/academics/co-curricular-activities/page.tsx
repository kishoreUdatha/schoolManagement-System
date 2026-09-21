// SCR-109 · Co-Curricular Activities
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: Phase 3 · Stories: US-0217 / US-0218
// Mock: screens/SCR-109_Co_Curricular_Activities.html
// Wired: GET/POST /api/v1/school/academics/activities, GET/PATCH /activities/{id}, POST /activities/{id}/members and /members/leave, GET /staff, /students. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Activities } from "@/features/academics/Activities";
import { PageAction } from "@/features/academics/planKit";

export const metadata = { title: "SCR-109 · Co-Curricular Activities · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-109"
      actions={
        <PageAction action="activities:create" icon="plus" primary>
          Create activity
        </PageAction>
      }
    >
      <Suspense>
        <Activities />
      </Suspense>
    </AppShell>
  );
}
