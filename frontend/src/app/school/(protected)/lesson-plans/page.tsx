"use client";

import { LessonPlans } from "@/components/syllabus/LessonPlans";
import { PageHeader } from "@/components/ui/Field";

export default function SchoolLessonPlansPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Lesson plans" subtitle="Review plans teachers have submitted." />
      <LessonPlans mode="reviewer" />
    </div>
  );
}
