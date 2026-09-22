// PM-028 · Payment receipt
// Parent app · Module: Fees & payments · Release: MVP · ERP: SCR-160
// Feature: View and download the school-issued payment receipt.
// Mock: Parent_Mobile_58_Screens/screens/PM-028_payment_receipt.html
// Wired: GET /api/v1/parent/me/children/{id}/payments (?order=), GET /api/v1/parent/me/children/{id}/payments/{order}/receipt.pdf (api.open / api.download), GET /api/v1/branding/me (school name, logo). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { PaymentReceipt } from "@/features/parent/fees/PaymentReceipt";

export const metadata = { title: "PM-028 · Payment receipt · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={28}>
      <Suspense>
        <PaymentReceipt />
      </Suspense>
    </ParentShell>
  );
}
