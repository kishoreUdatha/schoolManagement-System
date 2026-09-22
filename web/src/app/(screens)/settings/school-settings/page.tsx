// SCR-289 · School Settings
// Module: Settings / Roles / Permissions / Audit · Role: IT Admin · Release: Phase 2 · Stories: US-0577 / US-0578
// Mock: screens/SCR-289_School_Settings.html
// Wired: the school setup wizard, step by step (features/setup/SetupGuide): school details via PATCH /profile, then year, classes, subjects, periods, grading, staff, fees, students, payments, WhatsApp. Settings screens are tabs across the top. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { SettingsNav } from "@/features/settings/SettingsNav";
import { SetupGuide } from "@/features/setup/SetupGuide";

export const metadata = { title: "SCR-289 · School Settings · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-289">
      <div className="settings-layout">
        <SettingsNav active={289} />
        <ClientOnly>
          <SetupGuide />
        </ClientOnly>
      </div>
    </AppShell>
  );
}
