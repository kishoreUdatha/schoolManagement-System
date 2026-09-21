// SCR-290 · Academic Settings
// Module: Settings / Roles / Permissions / Audit · Role: IT Admin · Release: Phase 2 · Stories: US-0579 / US-0580
// Mock: screens/SCR-290_Academic_Settings.html
// Wired: GET /api/v1/school/academic-years, /academic-years/{id}/terms, GET /grade-scales, POST /grade-scales/{id}/default, GET/PUT /report-card-settings, GET/PATCH /profile (working days). Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { SubmitFor } from "@/features/setup/bits";
import { AcademicSettings } from "@/features/settings/AcademicSettings";

export const metadata = { title: "SCR-290 · Academic Settings · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-290" actions={<SubmitFor form="academic-form">Save settings</SubmitFor>}>
      <AcademicSettings />
    </AppShell>
  );
}
