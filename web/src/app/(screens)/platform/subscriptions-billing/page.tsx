// SCR-014 · Subscriptions & Billing
// Module: Super Admin / SaaS Administration · Role: Super Admin · Release: Phase 2 · Stories: US-0027 / US-0028
// Mock: screens/SCR-014_Subscriptions_Billing.html
// Backend: the old frontend served this at /super-admin/billing — Subscription, plan and payments; invoicing is not modelled
// Wired: GET /api/v1/super-admin/billing. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SubscriptionsBilling } from "@/features/platform/SubscriptionsBilling";

export const metadata = { title: "SCR-014 · Subscriptions & Billing · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-014">
      <Suspense>
        <SubscriptionsBilling />
      </Suspense>
    </AppShell>
  );
}
