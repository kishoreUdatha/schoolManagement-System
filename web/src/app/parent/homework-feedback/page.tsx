// PM-017 · Homework feedback
// Parent app · Module: Learning · Release: MVP · ERP: SCR-133 / SCR-137
// Feature: View teacher feedback, rubric or grade and resubmission instructions.
// Mock: Parent_Mobile_58_Screens/screens/PM-017_homework_feedback.html
// Wired: GET /api/v1/parent/me/children/{id}/homework, GET …/homework/{homework_id}/submission (remark, reviewer, rubric marking). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { HomeworkFeedback } from "@/features/parent/learning/HomeworkRecord";

export const metadata = { title: "PM-017 · Homework feedback · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={17}>
      <Suspense>
        <HomeworkFeedback />
      </Suspense>
    </ParentShell>
  );
}
