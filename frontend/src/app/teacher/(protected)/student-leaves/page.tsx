"use client";

import { StudentLeaves } from "@/components/cover/StudentLeaves";
import { PageHeader } from "@/components/ui/Field";

export default function TeacherStudentLeavesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Student leave" subtitle="Leave requests for the sections you're class teacher of." />
      <StudentLeaves />
    </div>
  );
}
