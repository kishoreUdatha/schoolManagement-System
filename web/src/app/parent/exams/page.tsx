// PM-019 · Exams
// Parent app · Module: Exams & results · Release: MVP · ERP: SCR-141
// Feature: View published assessments and exam dates.
// Mock: Parent_Mobile_58_Screens/screens/PM-019_exams.html
// Wired: GET /api/v1/parent/me/children/{id}/exam-schedule (upcoming datesheets), GET /api/v1/parent/me/calendar (?start, end; exams without papers yet), GET /api/v1/parent/me/children/{id}/exams (published). Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { Exams } from "@/features/parent/learning/Exams";

export const metadata = { title: "PM-019 · Exams · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={19}>
      <Exams />
    </ParentShell>
  );
}
