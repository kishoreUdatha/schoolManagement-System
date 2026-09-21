// SCR-223 · Behaviour / Discipline Incidents
// Module: Health / Counselling / Discipline · Role: Nurse / Medical Officer · Release: Phase 3 · Stories: US-0445 / US-0446
// Mock: screens/SCR-223_Behaviour_Discipline_Incidents.html
// Backend: the old frontend served this at /school/discipline — Report incident with category and severity
// Wired: GET/POST /api/v1/school/discipline/incidents. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { IncidentList } from "@/features/health/Pastoral";

export const metadata = { title: "SCR-223 · Behaviour / Discipline Incidents · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-223" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/health-wellbeing/behaviour-discipline-incidents?new=1" className="btn primary">
          <Icon name="check" className="sm" />
          Record incident
        </Link>
      </>}>
      <Suspense>
        <IncidentList />
      </Suspense>
    </AppShell>
  );
}
