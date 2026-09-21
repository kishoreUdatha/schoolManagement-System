// SCR-289 · School Settings
// Module: Settings / Roles / Permissions / Audit · Role: IT Admin · Release: Phase 2 · Stories: US-0577 / US-0578
// Mock: screens/SCR-289_School_Settings.html
// Wired: GET/PATCH /api/v1/school/profile, GET /academic-years, GET /settings. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { SubmitFor } from "@/features/setup/bits";
import { SchoolSettings } from "@/features/settings/GeneralSettings";

export const metadata = { title: "SCR-289 · School Settings · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-289" actions={<SubmitFor form="settings-form">Save settings</SubmitFor>}>
      <SchoolSettings />
    </AppShell>
  );
}
