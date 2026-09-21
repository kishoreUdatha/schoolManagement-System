// SCR-079 · Parent Activity History
// Module: Parents & Guardians · Role: School Admin · Release: Phase 3 · Stories: US-0157 / US-0158
// Mock: screens/SCR-079_Parent_Activity_History.html
// Backend: the old frontend served this at /school/parents/[id]/activity — Audit by actor and by subject, sign-ins stated as unrecorded
// Wired: GET /api/v1/school/parents/{id} (?id=), /audit-log (user_id; entity_type=User&entity_id). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ParentActivity } from "@/features/parents/ParentActivity";

export const metadata = { title: "SCR-079 · Parent Activity History · BrightCampus" };

// Not wired: "Export history" — dropped; /audit-log.csv exists but needs the bearer token, which a plain link cannot send.
export default function Page() {
  return (
    <AppShell screen="SCR-079">
      <Suspense>
        <ParentActivity />
      </Suspense>
    </AppShell>
  );
}
