// SCR-018 · System Health & Service Status
// Module: Super Admin / SaaS Administration · Role: Super Admin · Release: Phase 3 · Stories: US-0035 / US-0036
// Mock: screens/SCR-018_System_Health_Service_Status.html
// Backend: the old frontend served this at /super-admin/health — Two things probed; the rest labelled not monitored
// Wired: GET /api/v1/super-admin/health. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SystemHealth } from "@/features/platform/SystemHealth";

export const metadata = { title: "SCR-018 · System Health & Service Status · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-018">
      <Suspense>
        <SystemHealth />
      </Suspense>
    </AppShell>
  );
}
