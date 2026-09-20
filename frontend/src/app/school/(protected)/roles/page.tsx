"use client";

import { RolesAndBranches } from "@/components/rbac/RolesAndBranches";
import { PageHeader } from "@/components/ui/Field";

export default function SchoolRolesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Roles & branches" subtitle="Who can do what, and which campus they work at." />
      <RolesAndBranches />
    </div>
  );
}
