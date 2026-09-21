// SCR-144 · Admit Card
// Module: Examinations / Marks / Results · Role: Exam Coordinator · Release: MVP · Stories: US-0287 / US-0288
// Mock: screens/SCR-144_Admit_Card.html
// Backend: the old frontend served this at /school/exams/[id]/admit-cards — Per class, with room per paper, prints as PDF
// Wired: GET /api/v1/school/exam-ops/{id}/admit-cards?class_id=, …/admit-cards/{student_id} (?student=), …/admit-cards/{student_id}/pdf, /school/classes. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AdmitCards } from "@/features/examinations/AdmitCards";

export const metadata = { title: "SCR-144 · Admit Card · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-144">
      <Suspense>
        <AdmitCards />
      </Suspense>
    </AppShell>
  );
}
