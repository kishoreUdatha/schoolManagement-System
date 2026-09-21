// SCR-013 · Subscription Plans
// Module: Super Admin / SaaS Administration · Role: Super Admin · Release: Phase 2 · Stories: US-0025 / US-0026
// Mock: screens/SCR-013_Subscription_Plans.html
// Backend: the old frontend served this at /super-admin/plans — List plus create and edit
// Wired: GET/POST /api/v1/super-admin/plans, PATCH and DELETE (retire) plans/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { CreatePlanButton, SubscriptionPlans } from "@/features/platform/SubscriptionPlans";

export const metadata = { title: "SCR-013 · Subscription Plans · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-013" actions={<CreatePlanButton />}>
      <Suspense>
        <SubscriptionPlans />
      </Suspense>
    </AppShell>
  );
}
