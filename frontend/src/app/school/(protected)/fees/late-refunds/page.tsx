"use client";

import { LateFeesAndRefunds } from "@/components/fees/LateFeesAndRefunds";
import { PageHeader } from "@/components/ui/Field";

export default function SchoolLateFeesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Late fees & refunds" subtitle="Charge for late payment and give money back." />
      <LateFeesAndRefunds canApprove={true} />
    </div>
  );
}
