// PM-023 · Fees
// Parent app · Module: Fees & payments · Release: MVP · ERP: SCR-062 / SCR-162
// Feature: View outstanding invoices, instalments and receipts for selected child.
// Mock: Parent_Mobile_58_Screens/screens/PM-023_fees.html
// Wired: GET /api/v1/parent/me/children/{id}/fees, GET /api/v1/parent/me/children/{id}/payments. Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { Fees } from "@/features/parent/fees/Fees";

export const metadata = { title: "PM-023 · Fees · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={23}>
      <Suspense>
        <Fees />
      </Suspense>
    </ParentShell>
  );
}
