// SCR-224 · Incident Action & Follow-up
// Module: Health / Counselling / Discipline · Role: Nurse / Medical Officer · Release: Phase 3 · Stories: US-0447 / US-0448
// Mock: screens/SCR-224_Incident_Action_Follow_up.html
// Backend: the old frontend served this at /school/discipline/actions — A sanction can be marked served, and outstanding ones show
// Wired: GET/PATCH/DELETE /api/v1/school/discipline/incidents/{id} (?id=), POST /incidents/{id}/actions, /incidents/{id}/share, DELETE /discipline/actions/{id}; GET /wellbeing/discipline/actions, POST/DELETE /wellbeing/discipline/actions/{id}/serve. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { IncidentFollowUp, IdAction } from "@/features/health/Pastoral";

export const metadata = { title: "SCR-224 · Incident Action & Follow-up · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-224" actions={<Suspense>
        <IdAction screen={224} extra="new=1" icon="check">
          Add follow-up
        </IdAction>
      </Suspense>}>
      <Suspense>
        <IncidentFollowUp />
      </Suspense>
    </AppShell>
  );
}
