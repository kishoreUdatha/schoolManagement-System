"use client";

import { LeaveSetup } from "@/components/hr/LeaveSetup";
import { PageHeader } from "@/components/ui/Field";

export default function PrincipalLeaveEntitlementPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Leave entitlement" subtitle="Leave types and each employee's balance for the year." />
      <LeaveSetup canEdit={false} />
    </div>
  );
}
