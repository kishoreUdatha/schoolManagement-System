// SCR-295 · Data Import / Export / Backup
// Module: Settings / Roles / Permissions / Audit · Role: IT Admin · Release: Phase 3 · Stories: US-0589 / US-0590
// Mock: screens/SCR-295_Data_Import_Export_Backup.html
// Wired: GET/POST /api/v1/school/import-jobs (multipart), POST /import-jobs/{id}/commit, PATCH /import-jobs/{id}, GET /import-jobs/template.csv, GET /exports/students|staff|fees.csv, GET /academic-years, /classes. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { SubmitFor } from "@/features/setup/bits";
import { DataDesk } from "@/features/settings/DataDesk";

export const metadata = { title: "SCR-295 · Data Import / Export / Backup · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-295" actions={<SubmitFor form="import-form">Validate file</SubmitFor>}>
      <DataDesk />
    </AppShell>
  );
}
