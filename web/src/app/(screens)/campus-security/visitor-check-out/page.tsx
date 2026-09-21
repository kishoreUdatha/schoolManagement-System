// SCR-230 · Visitor Check-out
// Module: Visitor / Gate / Security · Role: Security · Release: Phase 3 · Stories: US-0459 / US-0460
// Mock: screens/SCR-230_Visitor_Check_out.html
// Backend: the old frontend served this at /school/front-desk — Check out with minutes inside
// Wired: GET /api/v1/school/front-desk/visits?inside_only=true, POST /visits/{id}/check-out. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { VisitorCheckOut } from "@/features/security/FrontDesk";

export const metadata = { title: "SCR-230 · Visitor Check-out · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-230" actions={<button type="submit" form="checkout-form" className="btn primary">
          <Icon name="check" className="sm" />
          Check out visitor
        </button>}>
      <Suspense>
        <VisitorCheckOut />
      </Suspense>
    </AppShell>
  );
}
