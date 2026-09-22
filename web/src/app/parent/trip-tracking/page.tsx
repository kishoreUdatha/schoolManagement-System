// PM-030 · Trip tracking
// Parent app · Module: Transport · Release: Phase 2 · ERP: SCR-195 / SCR-196
// Feature: Track active school trip with freshness indicator and safe fallback when GPS is stale.
// Mock: Parent_Mobile_58_Screens/screens/PM-030_trip_tracking.html
// Wired: GET /api/v1/parent/me/children/{id}/transport (every 30 s). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { TripTracking } from "@/features/parent/transport/TripTracking";

export const metadata = { title: "PM-030 · Trip tracking · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={30}>
      <Suspense>
        <TripTracking />
      </Suspense>
    </ParentShell>
  );
}
