// SCR-291 · Notification Settings
// Module: Settings / Roles / Permissions / Audit · Role: IT Admin · Release: Phase 2 · Stories: US-0581 / US-0582
// Mock: screens/SCR-291_Notification_Settings.html
// Wired: GET /api/v1/school/settings/notifications/categories, GET /integrations, GET/POST /settings/notifications/templates, PATCH/DELETE /templates/{id}, POST /templates/{id}/preview. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { NotificationSettings } from "@/features/settings/NotificationSettings";

export const metadata = { title: "SCR-291 · Notification Settings · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-291">
      <NotificationSettings />
    </AppShell>
  );
}
