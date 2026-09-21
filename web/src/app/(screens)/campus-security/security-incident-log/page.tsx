// SCR-233 · Security Incident Log
// Module: Visitor / Gate / Security · Role: Security · Release: Phase 3 · Stories: US-0465 / US-0466
// Mock: screens/SCR-233_Security_Incident_Log.html
// Backend: the old frontend served this at /school/front-desk — Log with time, place, severity, closure
// Wired: GET/POST /api/v1/school/front-desk/incidents, PATCH /front-desk/incidents/{id}. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { SecurityIncidentLog } from "@/features/security/FrontDesk";

export const metadata = { title: "SCR-233 · Security Incident Log · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-233" actions={<Link href="/campus-security/security-incident-log?new=1" className="btn primary">
          <Icon name="check" className="sm" />
          Record incident
        </Link>}>
      <Suspense>
        <SecurityIncidentLog />
      </Suspense>
    </AppShell>
  );
}
