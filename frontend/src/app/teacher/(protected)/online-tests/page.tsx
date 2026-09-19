"use client";

import { TestsList } from "@/components/online-exam/Tests";
import { PageHeader } from "@/components/ui/Field";

export default function TeacherOnlineTestsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Online tests" subtitle="Timed tests for your classes; students take them from the parent app." />
      <TestsList base="/teacher/online-tests" />
    </div>
  );
}
