// PM-032 · Transport request
// Parent app · Module: Transport · Release: Phase 2 · ERP: SCR-193
// Feature: Request route, stop or temporary non-use changes for approval.
// Mock: Parent_Mobile_58_Screens/screens/PM-032_transport_request.html
// Wired: GET /api/v1/parent/me/children/{id}/transport, GET …/transport/stop-options, POST /api/v1/parent/me/children/{id}/transport-requests,
// GET /api/v1/parent/me/requests?kind=transport_change, POST /api/v1/parent/me/requests/{id}/cancel. Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { TransportRequest } from "@/features/parent/transport/TransportRequest";

export const metadata = { title: "PM-032 · Transport request · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={32}>
      <Suspense>
        <TransportRequest />
      </Suspense>
    </ParentShell>
  );
}
