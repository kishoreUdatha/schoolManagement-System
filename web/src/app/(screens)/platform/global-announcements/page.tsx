// SCR-019 · Global Announcements
// Module: Super Admin / SaaS Administration · Role: Super Admin · Release: Phase 3 · Stories: US-0037 / US-0038
// Mock: screens/SCR-019_Global_Announcements.html
// Backend: the old frontend served this at /super-admin/announcements — Live only inside its window
// Wired: GET/POST /api/v1/super-admin/announcements, PATCH and DELETE announcements/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { GlobalAnnouncements, NewAnnouncementButton } from "@/features/platform/GlobalAnnouncements";

export const metadata = { title: "SCR-019 · Global Announcements · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-019" actions={<NewAnnouncementButton />}>
      <Suspense>
        <GlobalAnnouncements />
      </Suspense>
    </AppShell>
  );
}
