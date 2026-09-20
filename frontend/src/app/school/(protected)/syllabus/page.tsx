"use client";

import { SyllabusList } from "@/components/syllabus/SyllabusList";
import { PageHeader } from "@/components/ui/Field";

export default function SchoolSyllabusPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Syllabus" subtitle="Chapters and topics for every class-subject, and how far each section has got." />
      <SyllabusList linkBase="/school/syllabus" />
    </div>
  );
}
