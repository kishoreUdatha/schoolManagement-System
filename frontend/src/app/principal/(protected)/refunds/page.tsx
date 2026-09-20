"use client";

import { LateFeesAndRefunds } from "@/components/fees/LateFeesAndRefunds";
import { PageHeader } from "@/components/ui/Field";

export default function PrincipalRefundsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Late fees & refunds" subtitle="Approve refunds requested by the office." />
      <LateFeesAndRefunds canApprove={true} />
    </div>
  );
}
