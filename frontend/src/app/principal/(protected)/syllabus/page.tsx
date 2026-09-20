"use client";

import { SyllabusList } from "@/components/syllabus/SyllabusList";
import { PageHeader } from "@/components/ui/Field";

export default function PrincipalSyllabusPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Syllabus" subtitle="Syllabus progress across classes." />
      <SyllabusList linkBase="/principal/syllabus" />
    </div>
  );
}
