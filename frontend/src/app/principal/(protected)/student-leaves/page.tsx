"use client";

import { StudentLeaves } from "@/components/cover/StudentLeaves";
import { PageHeader } from "@/components/ui/Field";

export default function PrincipalStudentLeavesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Student leave" subtitle="Leave requests from parents across the school." />
      <StudentLeaves />
    </div>
  );
}
