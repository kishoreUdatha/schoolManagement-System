"use client";

import { Discipline } from "@/components/pastoral/Discipline";
import { PageHeader } from "@/components/ui/Field";

export default function TeacherDisciplinePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Discipline" subtitle="Report an incident, and follow the ones for your class." />
      <Discipline />
    </div>
  );
}
