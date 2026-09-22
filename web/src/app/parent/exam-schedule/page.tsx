// PM-020 · Exam schedule
// Parent app · Module: Exams & results · Release: MVP · ERP: SCR-141 / SCR-144
// Feature: View exam timing, syllabus and admit card when available.
// Mock: Parent_Mobile_58_Screens/screens/PM-020_exam_schedule.html
// Wired: GET /api/v1/parent/me/children/{id}/exam-schedule (upcoming) and …/exam-schedule/{exam_id} (papers, times, syllabus, instructions), …/exam-schedule/{exam_id}/admit-card.pdf. ?id= is the exam id. Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { ExamSchedule } from "@/features/parent/learning/Exams";

export const metadata = { title: "PM-020 · Exam schedule · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={20}>
      <Suspense>
        <ExamSchedule />
      </Suspense>
    </ParentShell>
  );
}
