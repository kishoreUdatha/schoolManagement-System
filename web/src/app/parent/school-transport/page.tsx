// PM-029 · School transport
// Parent app · Module: Transport · Release: Phase 2 · ERP: SCR-066 / SCR-193 / SCR-196
// Feature: View assigned route, trip status and boarding/drop alerts.
// Mock: Parent_Mobile_58_Screens/screens/PM-029_school_transport.html
// Wired: GET /api/v1/parent/me/children/{id}/transport (every 30 s). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { SchoolTransport } from "@/features/parent/transport/SchoolTransport";

export const metadata = { title: "PM-029 · School transport · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={29}>
      <Suspense>
        <SchoolTransport />
      </Suspense>
    </ParentShell>
  );
}
