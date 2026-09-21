// SCR-215 · Hostel Complaints & Fees
// Module: Hostel · Role: Hostel Warden · Release: Phase 3 · Stories: US-0429 / US-0430
// Mock: screens/SCR-215_Hostel_Complaints_Fees.html
// Backend: the old frontend served this at /school/hostel — Complaints triage plus monthly hostel fees
// Wired: GET/POST /api/v1/school/hostels/{id}/complaints, PATCH /hostels/complaints/{id}, POST /hostels/fees/generate; GET /fees/heads. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ComplaintsFees } from "@/features/hostel/Daily";

export const metadata = { title: "SCR-215 · Hostel Complaints & Fees · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-215" actions={<Link href="/hostel/hostel-complaints-fees?new=1" className="btn primary">
          <Icon name="plus" className="sm" />
          New complaint
        </Link>}>
      <Suspense>
        <ComplaintsFees />
      </Suspense>
    </AppShell>
  );
}
