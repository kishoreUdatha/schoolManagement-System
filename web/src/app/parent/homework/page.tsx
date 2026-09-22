// PM-014 · Homework
// Parent app · Module: Learning · Release: MVP · ERP: SCR-128 / SCR-131
// Feature: List child’s assignments by subject, due date and status.
// Mock: Parent_Mobile_58_Screens/screens/PM-014_homework.html
// Wired: GET /api/v1/parent/me/children/{id}/homework, GET …/homework/{homework_id}/submission (per assignment). Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { Homework } from "@/features/parent/learning/Homework";

export const metadata = { title: "PM-014 · Homework · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={14}>
      <Homework />
    </ParentShell>
  );
}
