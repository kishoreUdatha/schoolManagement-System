// PM-034 · Notice detail
// Parent app · Module: Communication · Release: MVP · ERP: SCR-252 / SCR-255
// Feature: Read full circular and acknowledge when the school requires it.
// Mock: Parent_Mobile_58_Screens/screens/PM-034_notice_detail.html
// Wired: GET /api/v1/parent/me/notices, POST /api/v1/parent/me/notices/{recipient_id}/mark-read (?id=). Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { NoticeDetail } from "@/features/parent/comms/notices";

export const metadata = { title: "PM-034 · Notice detail · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={34}>
      <Suspense>
        <NoticeDetail />
      </Suspense>
    </ParentShell>
  );
}
