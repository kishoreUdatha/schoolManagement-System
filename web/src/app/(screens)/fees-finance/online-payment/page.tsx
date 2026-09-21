// SCR-159 · Online Payment
// Module: Fees & Finance · Role: Parent · Release: MVP · Stories: US-0317 / US-0318
// Mock: screens/SCR-159_Online_Payment.html
// Backend: the old frontend served this at /parent/children/[id]/fees — Razorpay checkout, verify, failures
// Wired: GET /api/v1/parent/me/children, /children/{id}/fees, /children/{id}/payments; POST /children/{id}/fees/pay, /fees/pay/verify, /fees/pay/{order}/failed (?child=). Provider-hosted checkout only. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { OnlinePayment } from "@/features/fees/OnlinePayment";

export const metadata = { title: "SCR-159 · Online Payment · BrightCampus" };

export default function Page() {
  // "Continue to payment" lives in the form footer: it starts the provider's checkout, which needs the page's state.
  return (
    <AppShell screen="SCR-159">
      <Suspense>
        <OnlinePayment />
      </Suspense>
    </AppShell>
  );
}
