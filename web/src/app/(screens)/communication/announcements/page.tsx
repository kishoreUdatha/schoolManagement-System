// SCR-252 · Announcements
// Module: Events / PTM / Communication · Role: School Admin · Release: Phase 2 · Stories: US-0503 / US-0504
// Mock: screens/SCR-252_Announcements.html
// Backend: the old frontend served this at /school/notices — Title, body, audience, attachment, send
// Wired: GET /api/v1/school/notices, POST /notices/{id}/send, DELETE /notices/{id}; teacher GET /api/v1/teacher/notices; principal GET /api/v1/school/event-ops/campaigns. Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { Announcements } from "@/features/communication/Announcements";

export const metadata = { title: "SCR-252 · Announcements · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-252" actions={<Link href="/communication/notification-campaigns" className="btn primary">
        <Icon name="plus" className="sm" />
        Create announcement
      </Link>}>
      <Announcements />
    </AppShell>
  );
}
