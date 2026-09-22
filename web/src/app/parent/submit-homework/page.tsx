// PM-016 · Submit homework
// Parent app · Module: Learning · Release: MVP · ERP: SCR-132 / SCR-136
// Feature: Upload homework on behalf of child when the school permits parent submissions.
// Mock: Parent_Mobile_58_Screens/screens/PM-016_submit_homework.html
// Wired: GET /api/v1/parent/me/children/{id}/homework, GET + POST …/homework/{homework_id}/submission ({attachment_url, comment}; POST creates or replaces), POST/DELETE …/submission/files (multipart upload). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { SubmitHomework } from "@/features/parent/learning/HomeworkRecord";

export const metadata = { title: "PM-016 · Submit homework · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={16}>
      <Suspense>
        <SubmitHomework />
      </Suspense>
    </ParentShell>
  );
}
