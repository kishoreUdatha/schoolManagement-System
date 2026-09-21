// SCR-213 · Leave / Outing
// Module: Hostel · Role: Hostel Warden · Release: Phase 3 · Stories: US-0425 / US-0426
// Mock: screens/SCR-213_Leave_Outing.html
// Backend: the old frontend served this at /school/hostel — Request, approve, signed out, returned
// Wired: GET /api/v1/school/hostels/{id}/outings, POST /hostels/outings, /outings/{id}/decide, /out, /returned. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LeaveOuting } from "@/features/hostel/Daily";

export const metadata = { title: "SCR-213 · Leave / Outing · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-213" actions={<Link href="/hostel/leave-outing?new=1" className="btn primary">
          <Icon name="plus" className="sm" />
          New request
        </Link>}>
      <Suspense>
        <LeaveOuting />
      </Suspense>
    </AppShell>
  );
}
