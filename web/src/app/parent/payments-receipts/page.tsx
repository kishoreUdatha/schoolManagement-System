// PM-027 · Payments & receipts
// Parent app · Module: Fees & payments · Release: MVP · ERP: SCR-078 / SCR-160
// Feature: List verified transactions, pending attempts and downloadable receipts.
// Mock: Parent_Mobile_58_Screens/screens/PM-027_payments_receipts.html
// Wired: GET /api/v1/parent/me/children/{id}/payments, GET /api/v1/parent/me/children/{id}/fees. Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { PaymentsReceipts } from "@/features/parent/fees/PaymentsReceipts";

export const metadata = { title: "PM-027 · Payments & receipts · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={27}>
      <Suspense>
        <PaymentsReceipts />
      </Suspense>
    </ParentShell>
  );
}
