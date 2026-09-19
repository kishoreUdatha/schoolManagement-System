"use client";

import { LessonPlans } from "@/components/syllabus/LessonPlans";
import { PageHeader } from "@/components/ui/Field";

export default function TeacherLessonPlansPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Lesson plans" subtitle="Plan lessons, send them for review, and record them once taught." />
      <LessonPlans mode="teacher" />
    </div>
  );
}
