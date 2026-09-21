// SCR-204 · Renew / Reserve Book
// Module: Library · Role: Librarian · Release: Phase 3 · Stories: US-0407 / US-0408
// Mock: screens/SCR-204_Renew_Reserve_Book.html
// Backend: the old frontend served this at /school/library/reservations — Renew, reserve, queue and holds
// Wired: POST /api/v1/school/library/loans/{id}/renew, PATCH /loans/{id}; GET/POST /library/reservations, PATCH /reservations/{id}, POST /reservations/{id}/cancel. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { RenewReserve } from "@/features/library/Desk";

export const metadata = { title: "SCR-204 · Renew / Reserve Book · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-204" actions={<button type="submit" form="renew-form" className="btn primary">
          <Icon name="check" className="sm" />
          Save renewal
        </button>}>
      <Suspense>
        <RenewReserve />
      </Suspense>
    </AppShell>
  );
}
