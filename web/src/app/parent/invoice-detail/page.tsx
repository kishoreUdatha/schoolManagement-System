// PM-024 · Invoice detail
// Parent app · Module: Fees & payments · Release: MVP · ERP: SCR-157 / SCR-161
// Feature: Review payable fee line items and permitted instalments.
// Mock: Parent_Mobile_58_Screens/screens/PM-024_invoice_detail.html
// Wired: GET /api/v1/parent/me/children/{id}/fees. Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { InvoiceDetail } from "@/features/parent/fees/InvoiceDetail";

export const metadata = { title: "PM-024 · Invoice detail · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={24}>
      <Suspense>
        <InvoiceDetail />
      </Suspense>
    </ParentShell>
  );
}
