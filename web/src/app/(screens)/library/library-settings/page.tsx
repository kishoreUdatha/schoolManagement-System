// NEW-073 · Library Settings
// Module: Library · Role: Librarian · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /school/library/settings — Loan periods, limits, fines, holds
// Wired: GET/PATCH /api/v1/school/library/settings; GET /fees/heads. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LibrarySettings } from "@/features/library/Settings";

export const metadata = { title: "NEW-073 · Library Settings · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-073"
      actions={
        <button type="submit" form="library-settings" className="btn primary">
          <Icon name="check" className="sm" />
          Save settings
        </button>
      }
    >
      <Suspense>
        <LibrarySettings />
      </Suspense>
    </AppShell>
  );
}
