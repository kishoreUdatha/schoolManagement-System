// PM-021 · Results
// Parent app · Module: Exams & results · Release: MVP · ERP: SCR-150 / SCR-151
// Feature: Show only school-published marks and feedback.
// Mock: Parent_Mobile_58_Screens/screens/PM-021_results.html
// Wired: GET /api/v1/parent/me/children/{id}/exams, GET /api/v1/parent/me/children/{id}/exams/{exam_id} (?exam=). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { Results } from "@/features/parent/results/Results";

export const metadata = { title: "PM-021 · Results · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={21}>
      <Suspense>
        <Results />
      </Suspense>
    </ParentShell>
  );
}
