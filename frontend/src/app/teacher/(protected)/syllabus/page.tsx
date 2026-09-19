"use client";

import { SyllabusList } from "@/components/syllabus/SyllabusList";
import { PageHeader } from "@/components/ui/Field";

export default function TeacherSyllabusPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Syllabus" subtitle="Set up the syllabus for subjects you teach and tick off topics as you teach them." />
      <SyllabusList linkBase="/teacher/syllabus" />
    </div>
  );
}
