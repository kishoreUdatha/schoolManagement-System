// SCR-165 · Refunds
// Module: Fees & Finance · Role: Accountant · Release: Phase 2 · Stories: US-0329 / US-0330
// Mock: screens/SCR-165_Refunds.html
// Backend: the old frontend served this at /school/fees/late-refunds — Request, decide, pay out with reference
// Wired: GET/POST /api/v1/school/fees/refunds, GET /refunds/options/{student_id}, POST /refunds/{id}/decide, POST /refunds/{id}/process, GET /directory/students. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { Refunds } from "@/features/fees/Refunds";

export const metadata = { title: "SCR-165 · Refunds · BrightCampus" };

export default function Page() {
  // Approve / decline sit on each request card, where the refund being decided is known.
  return (
    <AppShell screen="SCR-165">
      <ClientOnly>
        <Refunds />
      </ClientOnly>
    </AppShell>
  );
}
