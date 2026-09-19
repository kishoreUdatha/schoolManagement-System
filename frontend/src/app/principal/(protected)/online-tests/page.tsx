"use client";

import { TestsList } from "@/components/online-exam/Tests";
import { PageHeader } from "@/components/ui/Field";

export default function PrincipalOnlineTestsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Online tests" subtitle="Tests across the school and how students did." />
      <TestsList base="/principal/online-tests" canCreate={false} />
    </div>
  );
}
