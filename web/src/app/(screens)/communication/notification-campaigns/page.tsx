// SCR-254 · Notification Campaigns
// Module: Events / PTM / Communication · Role: School Admin · Release: Phase 3 · Stories: US-0507 / US-0508
// Mock: screens/SCR-254_Notification_Campaigns.html
// Backend: the old frontend served this at /school/notices/campaigns — A run command a cron or a button can call
// Wired: POST /api/v1/school/notices, GET/PATCH /notices/{id} (?id=), POST /notices/{id}/send, GET /school/event-ops/campaigns, GET /school/ops/scheduled-notices, POST /school/ops/scheduled-notices/run; teacher POST /api/v1/teacher/notices, GET /teacher/my-classes, /teacher/sections/{id}/students. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { CampaignAction, NotificationCampaigns } from "@/features/communication/NotificationCampaigns";

export const metadata = { title: "SCR-254 · Notification Campaigns · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-254" actions={<CampaignAction />}>
      <Suspense>
        <NotificationCampaigns />
      </Suspense>
    </AppShell>
  );
}
