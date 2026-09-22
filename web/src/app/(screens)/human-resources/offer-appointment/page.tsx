// SCR-177 · Offer & Appointment
// Module: HR / Leave / Payroll · Role: HR · Release: Phase 2 · Stories: US-0353 / US-0354
// Mock: screens/SCR-177_Offer_Appointment.html
// Backend: the old frontend served this at /school/recruitment — Draft, send, respond, hire creates staff
// Wired: GET /api/v1/school/hr/applications[/{id}] (?id=), POST /hr/applications/{id}/offer, /hr/offers/{id}/send, /respond, /withdraw, /hire; GET /hr/offers/{id}/letter ("Generate letter", a PDF). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { OfferAppointment, OfferLetterAction } from "@/features/hr/OfferAppointment";

export const metadata = { title: "SCR-177 · Offer & Appointment · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-177" actions={<Suspense><OfferLetterAction /></Suspense>}>
      <Suspense>
        <OfferAppointment />
      </Suspense>
    </AppShell>
  );
}
