"use client";

import { LateFeesAndRefunds } from "@/components/fees/LateFeesAndRefunds";
import { PageHeader } from "@/components/ui/Field";

export default function AccountantLateFeesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Late fees & refunds" subtitle="Charge for late payment, request refunds and record payouts." />
      <LateFeesAndRefunds canApprove={false} />
    </div>
  );
}
