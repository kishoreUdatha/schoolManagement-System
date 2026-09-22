// PM-056 · Learning resources
// Parent app · Module: Progress & resources · Release: Phase 2 · ERP: SCR-106 / SCR-206
// Feature: Open teacher-approved videos, worksheets and reading resources.
// Mock: Parent_Mobile_58_Screens/screens/PM-056_learning_resources.html
// Wired: GET /api/v1/parent/me/children/{id}/videos, POST/DELETE …/videos/{id}/completion, GET /api/v1/parent/me/children/{id}/resources, GET …/resources/{id}/file. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { LearningResources } from "@/features/parent/progress/LearningResources";

export const metadata = { title: "PM-056 · Learning resources · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={56}>
      <LearningResources />
    </ParentShell>
  );
}
