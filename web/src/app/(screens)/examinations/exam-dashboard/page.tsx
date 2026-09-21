// SCR-138 · Exam Dashboard
// Module: Examinations / Marks / Results · Role: Exam Coordinator · Release: MVP · Stories: US-0275 / US-0276
// Mock: screens/SCR-138_Exam_Dashboard.html
// Backend: the old frontend served this at /school/exams/[id] — Readiness checklist per paper, with what blocks publication
// Wired: GET /api/v1/school/academic-years, /school/exams, /school/exam-ops/{id}/dashboard, /school/exam-ops/{id}/datesheet. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ExamDashboard } from "@/features/examinations/ExamDashboard";

export const metadata = { title: "SCR-138 · Exam Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-138" actions={<Link href="/examinations/exam-setup" className="btn primary">
        <Icon name="plus" className="sm" />
        Create exam
      </Link>}>
      <Suspense>
        <ExamDashboard />
      </Suspense>
    </AppShell>
  );
}
