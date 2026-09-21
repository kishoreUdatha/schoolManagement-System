// SCR-296 · Notification Center
// Module: Events / PTM / Communication · Role: All Users · Release: MVP · Stories: US-0591 / US-0592
// Mock: screens/SCR-296_Notification_Center.html
// Backend: the old frontend served this at /staff/inbox — That person own post, with unread falling when read
// Wired: staff GET /api/v1/staff/inbox, /staff/inbox/unread-count, POST /staff/inbox/{id}/mark-read; parent GET /api/v1/parent/me/notices, /unread-count, POST /parent/me/notices/{id}/mark-read. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { MarkAllReadButton, NotificationCenter } from "@/features/communication/NotificationCenter";

export const metadata = { title: "SCR-296 · Notification Center · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-296" actions={<MarkAllReadButton />}>
      <NotificationCenter />
    </AppShell>
  );
}
