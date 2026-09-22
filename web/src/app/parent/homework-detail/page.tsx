// PM-015 · Homework detail
// Parent app · Module: Learning · Release: MVP · ERP: SCR-130 / SCR-131
// Feature: Read instructions, resources and submission requirements.
// Mock: Parent_Mobile_58_Screens/screens/PM-015_homework_detail.html
// Wired: GET /api/v1/parent/me/children/{id}/homework (record ?id= from the list; no single-homework GET), GET …/homework/{homework_id}/submission. Hand-maintained.
// Not wired: accepted file types and size limit — submissions are links, the API sets no file rules.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { HomeworkDetail } from "@/features/parent/learning/HomeworkRecord";

export const metadata = { title: "PM-015 · Homework detail · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={15}>
      <Suspense>
        <HomeworkDetail />
      </Suspense>
    </ParentShell>
  );
}
