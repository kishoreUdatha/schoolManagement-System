// PM-022 · Report card
// Parent app · Module: Exams & results · Release: MVP · ERP: SCR-152
// Feature: View a released report card and school remarks.
// Mock: Parent_Mobile_58_Screens/screens/PM-022_report_card.html
// Wired: GET /api/v1/parent/me/children/{id}/exams/{exam_id} (?exam=, else latest from GET /api/v1/parent/me/children/{id}/exams), GET …/report-card.pdf (api.download). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { ReportCard } from "@/features/parent/results/ReportCard";

export const metadata = { title: "PM-022 · Report card · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={22}>
      <Suspense>
        <ReportCard />
      </Suspense>
    </ParentShell>
  );
}
