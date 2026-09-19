"use client";

import { QuestionBank } from "@/components/online-exam/QuestionBank";
import { PageHeader } from "@/components/ui/Field";

export default function SchoolQuestionBankPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Question bank" subtitle="Reusable questions tagged by subject, Bloom's level and difficulty." />
      <QuestionBank />
    </div>
  );
}
