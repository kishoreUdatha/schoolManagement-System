// SCR-227 · Visitor Check-in
// Module: Visitor / Gate / Security · Role: Security · Release: Phase 2 · Stories: US-0453 / US-0454
// Mock: screens/SCR-227_Visitor_Check_in.html
// Backend: the old frontend served this at /school/front-desk — Walk-in check-in with ID and host
// Wired: POST /api/v1/school/front-desk/visits; GET /front-desk/hosts, /front-desk/visits?inside_only=true, /students (search). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { VisitorCheckIn } from "@/features/security/FrontDesk";

export const metadata = { title: "SCR-227 · Visitor Check-in · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-227" actions={<button type="submit" form="checkin-form" className="btn primary">
          <Icon name="check" className="sm" />
          Check in
        </button>}>
      <Suspense>
        <VisitorCheckIn />
      </Suspense>
    </AppShell>
  );
}
