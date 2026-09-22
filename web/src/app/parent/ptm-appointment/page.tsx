// PM-040 · PTM appointment
// Parent app · Module: Events & PTM · Release: MVP · ERP: SCR-251 / SCR-077
// Feature: View confirmed booking, location and cancellation rules.
// Mock: Parent_Mobile_58_Screens/screens/PM-040_ptm_appointment.html
// Wired: GET /api/v1/parent/me/ptm, DELETE /api/v1/parent/me/ptm/slots/{slot_id} (?slot=). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { PtmAppointment } from "@/features/parent/events/PtmAppointment";

export const metadata = { title: "PM-040 · PTM appointment · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={40}>
      <Suspense>
        <PtmAppointment />
      </Suspense>
    </ParentShell>
  );
}
