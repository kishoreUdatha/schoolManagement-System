// NEW-027 · Parent Surveys
// Module: Events / PTM / Communication · Role: School Admin · Release: Extension
// New screen (no mock) — the surveys parents answer on PM-054 Feedback survey
// Wired: GET/POST /api/v1/school/parent-services/surveys, PUT/DELETE /surveys/{id}, POST /surveys/{id}/status,
// GET /surveys/{id}/results; GET /school/academic-years, /school/classes (current year). Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ParentSurveys } from "@/features/communication/ParentSurveys";

export const metadata = { title: "NEW-027 · Parent Surveys · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-027">
      <ParentSurveys />
    </AppShell>
  );
}
