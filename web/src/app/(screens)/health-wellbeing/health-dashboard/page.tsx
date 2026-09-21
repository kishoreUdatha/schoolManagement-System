// SCR-216 · Health Dashboard
// Module: Health / Counselling / Discipline · Role: Nurse / Medical Officer · Release: Phase 2 · Stories: US-0431 / US-0432
// Mock: screens/SCR-216_Health_Dashboard.html
// Backend: the old frontend served this at /school/health — Five KPI cards with visits and alerts tabs
// Wired: GET /api/v1/school/health/dashboard, /health/visits (?on=), /health/immunizations-due, /wellbeing/counselling/appointments (today). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { HealthDashboardView } from "@/features/health/Clinic";

export const metadata = { title: "SCR-216 · Health Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-216" actions={<Link href="/health-wellbeing/clinic-visit" className="btn primary">
          <Icon name="arrow" className="sm" />
          Record clinic visit
        </Link>}>
      <Suspense>
        <HealthDashboardView />
      </Suspense>
    </AppShell>
  );
}
