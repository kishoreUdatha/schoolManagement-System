// PM-033 · Notice board
// Parent app · Module: Communication · Release: MVP · ERP: SCR-252
// Feature: Read targeted school announcements and attachments.
// Mock: Parent_Mobile_58_Screens/screens/PM-033_notice_board.html
// Wired: GET /api/v1/parent/me/notices (?unread_only). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { NoticeBoard } from "@/features/parent/comms/notices";

export const metadata = { title: "PM-033 · Notice board · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={33}>
      <Suspense>
        <NoticeBoard />
      </Suspense>
    </ParentShell>
  );
}
