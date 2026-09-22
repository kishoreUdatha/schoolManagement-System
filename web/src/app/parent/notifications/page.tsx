// PM-007 · Notifications
// Parent app · Module: Home & profile · Release: MVP · ERP: SCR-296
// Feature: Receive child-scoped alerts and deep-link to records.
// Mock: Parent_Mobile_58_Screens/screens/PM-007_notifications.html
// Wired: GET /api/v1/parent/me/notices (?unread_only, limit), POST /api/v1/parent/me/notices/{recipient_id}/mark-read. Hand-maintained.
// Not wired: category filter and deep links to records — notices carry no category or target.

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
