// SCR-020 · Platform Settings
// Module: Super Admin / SaaS Administration · Role: Super Admin · Release: Phase 3 · Stories: US-0039 / US-0040
// Mock: screens/SCR-020_Platform_Settings.html
// Backend: the old frontend served this at /super-admin/settings — Known knobs listed before anybody sets them
// Wired: GET/PUT /api/v1/super-admin/settings, DELETE settings/{key}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { PlatformSettings } from "@/features/platform/PlatformSettings";

export const metadata = { title: "SCR-020 · Platform Settings · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-020" actions={<button type="submit" form="platform-settings-form" className="btn primary">
          <Icon name="check" className="sm" />
          Save settings
        </button>}>
      <Suspense>
        <PlatformSettings />
      </Suspense>
    </AppShell>
  );
}
