// PM-007 · Notifications
// Parent app · Module: Home & profile · Release: MVP · ERP: SCR-296
// Feature: Receive child-scoped alerts and deep-link to records.
// Mock: Parent_Mobile_58_Screens/screens/PM-007_notifications.html
// Wired: GET /api/v1/parent/me/notices (?unread_only, category, limit), POST /api/v1/parent/me/notices/{recipient_id}/mark-read. Deep links from each notice's link. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { Notifications } from "@/features/parent/home/Notifications";

export const metadata = { title: "PM-007 · Notifications · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={7}>
      <Notifications />
    </ParentShell>
  );
}
