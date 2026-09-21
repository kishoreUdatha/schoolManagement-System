// SCR-226 · Visitor Dashboard
// Module: Visitor / Gate / Security · Role: Security · Release: Phase 2 · Stories: US-0451 / US-0452
// Mock: screens/SCR-226_Visitor_Dashboard.html
// Backend: the old frontend served this at /school/front-desk — Six stat cards including inside now
// Wired: GET /api/v1/school/front-desk/dashboard, /front-desk/visits?on=today, /front-desk/gate-passes?on=today. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { VisitorDashboard } from "@/features/security/FrontDesk";

export const metadata = { title: "SCR-226 · Visitor Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-226" actions={<Link href="/campus-security/visitor-check-in" className="btn primary">
          <Icon name="arrow" className="sm" />
          Check in visitor
        </Link>}>
      <Suspense>
        <VisitorDashboard />
      </Suspense>
    </AppShell>
  );
}
