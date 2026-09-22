// PM-054 · Feedback survey
// Parent app · Module: Feedback · Release: Phase 2 · ERP: SCR-077 / SCR-255
// Feature: Submit school-requested feedback with clear audience and submission status.
// Mock: Parent_Mobile_58_Screens/screens/PM-054_feedback_survey.html
// Wired: none — no survey endpoint exists; the screen says so and links to requests. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { FeedbackSurvey } from "@/features/parent/support/FeedbackSurvey";

export const metadata = { title: "PM-054 · Feedback survey · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={54}>
      <FeedbackSurvey />
    </ParentShell>
  );
}
