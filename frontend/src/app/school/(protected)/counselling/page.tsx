"use client";

import { Counselling } from "@/components/pastoral/Counselling";
import { PageHeader } from "@/components/ui/Field";

export default function SchoolCounsellingPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Counselling" subtitle="Pastoral cases and session notes — kept private." />
      <Counselling />
    </div>
  );
}
