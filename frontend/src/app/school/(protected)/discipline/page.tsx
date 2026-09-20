"use client";

import { Discipline } from "@/components/pastoral/Discipline";
import { PageHeader } from "@/components/ui/Field";

export default function SchoolDisciplinePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Discipline" subtitle="Incidents, what was done and what parents were told." />
      <Discipline />
    </div>
  );
}
