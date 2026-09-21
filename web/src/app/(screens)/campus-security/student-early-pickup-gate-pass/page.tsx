// SCR-231 · Student Early Pickup / Gate Pass
// Module: Visitor / Gate / Security · Role: Security · Release: Phase 3 · Stories: US-0461 / US-0462
// Mock: screens/SCR-231_Student_Early_Pickup_Gate_Pass.html
// Backend: the old frontend served this at /school/front-desk — Issue, approve, verify code, release
// Wired: GET/POST /api/v1/school/front-desk/gate-passes, POST /gate-passes/{id}/decide, /gate-passes/verify, /gate-passes/{id}/release. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { GatePassDesk } from "@/features/security/FrontDesk";

export const metadata = { title: "SCR-231 · Student Early Pickup / Gate Pass · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-231" actions={<button type="submit" form="gatepass-form" className="btn primary">
          <Icon name="check" className="sm" />
          Request gate pass
        </button>}>
      <Suspense>
        <GatePassDesk />
      </Suspense>
    </AppShell>
  );
}
