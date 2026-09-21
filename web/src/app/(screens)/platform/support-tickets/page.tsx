// SCR-017 · Support Tickets
// Module: Super Admin / SaaS Administration · Role: Super Admin · Release: Phase 3 · Stories: US-0033 / US-0034
// Mock: screens/SCR-017_Support_Tickets.html
// Backend: the old frontend served this at /super-admin/tickets — Internal notes kept out of a non-internal read, in the service
// Wired: GET/POST /api/v1/super-admin/tickets, GET/PATCH tickets/{id}, POST tickets/{id}/replies. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { NewTicketButton, SupportTickets } from "@/features/platform/SupportTickets";

export const metadata = { title: "SCR-017 · Support Tickets · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-017" actions={<NewTicketButton />}>
      <Suspense>
        <SupportTickets />
      </Suspense>
    </AppShell>
  );
}
