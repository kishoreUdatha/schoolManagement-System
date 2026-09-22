// PM-055 · Weekly progress
// Parent app · Module: Progress & resources · Release: Phase 2 · ERP: SCR-270 / SCR-271
// Feature: Summarize teacher-published learning progress, strengths and support needs.
// Mock: Parent_Mobile_58_Screens/screens/PM-055_weekly_progress.html
// Wired: GET /api/v1/parent/me/children/{id}/weekly-reports. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { WeeklyProgress } from "@/features/parent/progress/WeeklyProgress";

export const metadata = { title: "PM-055 · Weekly progress · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={55}>
      <WeeklyProgress />
    </ParentShell>
  );
}
