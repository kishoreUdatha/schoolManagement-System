// PM-026 · Payment status
// Parent app · Module: Fees & payments · Release: MVP · ERP: SCR-159 / SCR-160
// Feature: Reconcile payment using server-verified provider status and prevent duplicate attempts.
// Mock: Parent_Mobile_58_Screens/screens/PM-026_payment_status.html
// Wired: GET /api/v1/parent/me/children/{id}/payments (?order=). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { PaymentStatus } from "@/features/parent/fees/PaymentStatus";

export const metadata = { title: "PM-026 · Payment status · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={26}>
      <Suspense>
        <PaymentStatus />
      </Suspense>
    </ParentShell>
  );
}
