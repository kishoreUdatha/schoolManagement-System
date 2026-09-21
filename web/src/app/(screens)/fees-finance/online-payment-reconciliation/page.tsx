// NEW-044 · Online Payment Reconciliation
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/school/payments/reconciliation, /payments/online, /payments/online/{order_id}/receipt.pdf. Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ClientOnly } from "@/features/fees/common";
import { Reconciliation } from "@/features/fees/Reconciliation";

export const metadata = { title: "NEW-044 · Online Payment Reconciliation · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-044" actions={<Link href="/fees-finance/payment-gateway-settings" className="btn">
        <Icon name="settings" className="sm" />
        Gateway settings
      </Link>}>
      <ClientOnly>
        <Reconciliation />
      </ClientOnly>
    </AppShell>
  );
}
