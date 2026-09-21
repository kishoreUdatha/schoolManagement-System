// SCR-229 · Visitor Pass
// Module: Visitor / Gate / Security · Role: Security · Release: Phase 2 · Stories: US-0457 / US-0458
// Mock: screens/SCR-229_Visitor_Pass.html
// Backend: the old frontend served this at /school/front-desk/passes — Printable pass with a print-only stylesheet
// Wired: GET /api/v1/school/front-desk/visits?on= (the visit in ?id=), printed with a print-only stylesheet. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PrintButton, VisitorPass } from "@/features/security/FrontDesk";

export const metadata = { title: "SCR-229 · Visitor Pass · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-229" actions={<PrintButton primary>Print pass</PrintButton>}>
      <Suspense>
        <VisitorPass />
      </Suspense>
    </AppShell>
  );
}
