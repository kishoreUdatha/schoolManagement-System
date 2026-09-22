// PM-031 · Route & stops
// Parent app · Module: Transport · Release: Phase 2 · ERP: SCR-189 / SCR-191
// Feature: View assigned route, designated stop and timing.
// Mock: Parent_Mobile_58_Screens/screens/PM-031_route_stops.html
// Wired: GET /api/v1/parent/me/children/{id}/transport. Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { RouteStops } from "@/features/parent/transport/RouteStops";

export const metadata = { title: "PM-031 · Route & stops · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={31}>
      <Suspense>
        <RouteStops />
      </Suspense>
    </ParentShell>
  );
}
