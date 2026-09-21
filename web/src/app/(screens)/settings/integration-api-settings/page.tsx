// SCR-292 · Integration / API Settings
// Module: Settings / Roles / Permissions / Audit · Role: IT Admin · Release: Phase 3 · Stories: US-0583 / US-0584
// Mock: screens/SCR-292_Integration_API_Settings.html
// Wired: GET /api/v1/school/integrations. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { IntegrationSettings } from "@/features/settings/GeneralSettings";

export const metadata = { title: "SCR-292 · Integration / API Settings · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-292">
      <IntegrationSettings />
    </AppShell>
  );
}
