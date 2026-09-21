// SCR-222 · Counselling Case Notes
// Module: Health / Counselling / Discipline · Role: Nurse / Medical Officer · Release: Phase 3 · Stories: US-0443 / US-0444
// Mock: screens/SCR-222_Counselling_Case_Notes.html
// Backend: the old frontend served this at /school/counselling — Session notes with privacy and closure
// Wired: GET/POST /api/v1/school/discipline/counselling/cases, GET/PATCH /cases/{id} (?id=), POST /cases/{id}/sessions, /cases/{id}/inform-parents. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { CaseNotes } from "@/features/health/Pastoral";

export const metadata = { title: "SCR-222 · Counselling Case Notes · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-222" actions={<>
        <Link href="/health-wellbeing/counselling-case-notes?new=1" className="btn">
          <Icon name="plus" className="sm" />
          Open case
        </Link>
        <button type="submit" form="session-form" className="btn primary">
          <Icon name="check" className="sm" />
          Save case note
        </button>
      </>}>
      <Suspense>
        <CaseNotes />
      </Suspense>
    </AppShell>
  );
}
