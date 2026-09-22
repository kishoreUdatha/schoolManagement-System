// PM-038 · Event & consent
// Parent app · Module: Events & PTM · Release: MVP · ERP: SCR-248 / SCR-249
// Feature: Review event details and submit or decline explicit parental consent.
// Mock: Parent_Mobile_58_Screens/screens/PM-038_event_consent.html
// Wired: GET /api/v1/parent/me/events, POST /api/v1/parent/me/events/{event_id}/consent (?id=). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { EventConsent } from "@/features/parent/events/EventConsent";

export const metadata = { title: "PM-038 · Event & consent · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={38}>
      <Suspense>
        <EventConsent />
      </Suspense>
    </ParentShell>
  );
}
