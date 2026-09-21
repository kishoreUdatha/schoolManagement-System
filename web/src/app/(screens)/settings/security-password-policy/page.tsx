// SCR-293 · Security & Password Policy
// Module: Settings / Roles / Permissions / Audit · Role: IT Admin · Release: Phase 3 · Stories: US-0585 / US-0586
// Mock: screens/SCR-293_Security_Password_Policy.html
// Wired: GET/PUT /api/v1/school/settings/security. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { SubmitFor } from "@/features/setup/bits";
import { SecuritySettings } from "@/features/settings/GeneralSettings";

export const metadata = { title: "SCR-293 · Security & Password Policy · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-293" actions={<SubmitFor form="security-form">Save policy</SubmitFor>}>
      <SecuritySettings />
    </AppShell>
  );
}
