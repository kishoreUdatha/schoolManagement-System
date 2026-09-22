// PM-025 · Payment method
// Parent app · Module: Fees & payments · Release: MVP · ERP: SCR-159
// Feature: Start payment through the configured provider without storing card details.
// Mock: Parent_Mobile_58_Screens/screens/PM-025_payment_method.html
// Wired: GET /api/v1/parent/me/children/{id}/fees, GET /api/v1/parent/me/children/{id}/payments, POST /api/v1/parent/me/children/{id}/fees/pay, provider-hosted checkout, POST /api/v1/parent/me/children/{id}/fees/pay/verify, POST /api/v1/parent/me/children/{id}/fees/pay/{order}/failed (?fees=). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { PaymentMethod } from "@/features/parent/fees/PaymentMethod";

export const metadata = { title: "PM-025 · Payment method · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={25}>
      <Suspense>
        <PaymentMethod />
      </Suspense>
    </ParentShell>
  );
}
