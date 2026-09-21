// SCR-177 · Offer & Appointment
// Module: HR / Leave / Payroll · Role: HR · Release: Phase 2 · Stories: US-0353 / US-0354
// Mock: screens/SCR-177_Offer_Appointment.html
// Backend: the old frontend served this at /school/recruitment — Draft, send, respond, hire creates staff
// Wired: GET /api/v1/school/hr/applications[/{id}] (?id=), POST /hr/applications/{id}/offer, /hr/offers/{id}/send, /respond, /withdraw, /hire. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { OfferAppointment } from "@/features/hr/OfferAppointment";

export const metadata = { title: "SCR-177 · Offer & Appointment · BrightCampus" };

export default function Page() {
  return (
    // Not wired: "Generate letter" — no endpoint renders an offer letter; the button saves the offer instead.
    <AppShell screen="SCR-177" actions={<button type="submit" form="offer-form" className="btn primary">
        <Icon name="check" className="sm" />
        Save offer
      </button>}>
      <Suspense>
        <OfferAppointment />
      </Suspense>
    </AppShell>
  );
}
