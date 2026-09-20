"use client";

import { GradingSetup } from "@/components/grading/GradingSetup";
import { PageHeader } from "@/components/ui/Field";

export default function SchoolGradingPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Grading" subtitle="Grade scales, exam types and what the printed report card shows." />
      <GradingSetup />
    </div>
  );
}
