// SCR-251 · PTM Slot Booking
// Module: Events / PTM / Communication · Role: Teacher · Release: Phase 2 · Stories: US-0501 / US-0502
// Mock: screens/SCR-251_PTM_Slot_Booking.html
// Backend: the old frontend served this at /parent/meetings — Slot grid, book, cancel, mark done
// Wired: parent GET /api/v1/parent/me/ptm, /parent/me/children, POST /parent/me/ptm/book, DELETE /parent/me/ptm/slots/{id}; teacher GET /api/v1/teacher/ptm, PUT /teacher/ptm/slots/{id}, POST /teacher/ptm/sessions/{id}/publish; office GET /api/v1/school/ptm, /ptm/{id} (?id=), DELETE /ptm/{id}/slots/{slot}/booking. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ConfirmBookingButton, PtmSlotBooking } from "@/features/communication/PtmSlotBooking";

export const metadata = { title: "SCR-251 · PTM Slot Booking · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-251" actions={<ConfirmBookingButton />}>
      <Suspense>
        <PtmSlotBooking />
      </Suspense>
    </AppShell>
  );
}
