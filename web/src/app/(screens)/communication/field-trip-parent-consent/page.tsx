// SCR-249 · Field Trip & Parent Consent
// Module: Events / PTM / Communication · Role: School Admin · Release: Phase 2 · Stories: US-0497 / US-0498
// Mock: screens/SCR-249_Field_Trip_Parent_Consent.html
// Backend: the old frontend served this at /parent/events — Deadline and per-child consent with report
// Wired: staff GET /api/v1/school/events, GET /events/{id}/consents, POST /events/{id}/publish; parent GET /api/v1/parent/me/events, POST /parent/me/events/{id}/consent. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ConsentRequestButton, FieldTripConsent } from "@/features/communication/FieldTripConsent";

export const metadata = { title: "SCR-249 · Field Trip & Parent Consent · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-249" actions={<ConsentRequestButton />}>
      <Suspense>
        <FieldTripConsent />
      </Suspense>
    </AppShell>
  );
}
