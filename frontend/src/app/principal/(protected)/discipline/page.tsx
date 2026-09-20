"use client";

import { Discipline } from "@/components/pastoral/Discipline";
import { PageHeader } from "@/components/ui/Field";

export default function PrincipalDisciplinePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Discipline" subtitle="Incidents across the school." />
      <Discipline />
    </div>
  );
}
