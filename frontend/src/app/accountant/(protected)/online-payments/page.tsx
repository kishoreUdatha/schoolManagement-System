"use client";

import { OnlinePaymentsList } from "@/components/OnlinePaymentsList";
import { PageHeader } from "@/components/ui/Field";

export default function AccountantOnlinePaymentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Online payments" subtitle="Fees paid by parents through the parent portal." />
      <OnlinePaymentsList />
    </div>
  );
}
