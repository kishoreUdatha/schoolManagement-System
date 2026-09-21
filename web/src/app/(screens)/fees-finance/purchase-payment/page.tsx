// SCR-169 · Purchase / Payment
// Module: Fees & Finance · Role: Accountant · Release: Phase 3 · Stories: US-0337 / US-0338
// Mock: screens/SCR-169_Purchase_Payment.html
// Backend: the old frontend served this at /school/purchasing/orders — Orders, bills and payments; a bill cannot be overpaid
// Wired: GET /api/v1/school/inventory/suppliers, /finance/bills, /finance/orders; POST /finance/payments. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ClientOnly } from "@/features/fees/common";
import { PurchasePayment } from "@/features/fees/PurchasePayment";

export const metadata = { title: "SCR-169 · Purchase / Payment · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-169" actions={<button type="submit" form="purchase-payment-form" className="btn primary">
        <Icon name="check" className="sm" />
        Create payment
      </button>}>
      <ClientOnly>
        <PurchasePayment />
      </ClientOnly>
    </AppShell>
  );
}
