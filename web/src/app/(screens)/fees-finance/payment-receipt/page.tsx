// SCR-160 · Payment Receipt
// Module: Fees & Finance · Role: Parent · Release: MVP · Stories: US-0319 / US-0320
// Mock: screens/SCR-160_Payment_Receipt.html
// Backend: the old frontend served this at /parent/children/[id]/fees — Per-order receipt PDF
// Wired: GET /api/v1/parent/me/children/{id}/payments (+ /{order}/receipt.pdf), /school/payments/online (+ /{order}/receipt.pdf), /school/accounts/collections/{id} (?child=&order= or ?receipt=), /branding/me (school name and address). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { PaymentReceipt } from "@/features/fees/PaymentReceipt";

export const metadata = { title: "SCR-160 · Payment Receipt · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-160" actions={<button type="button" className="btn primary" data-print="">
        <Icon name="download" className="sm" />
        Print receipt
      </button>}>
      <Suspense>
        <PaymentReceipt />
      </Suspense>
    </AppShell>
  );
}
