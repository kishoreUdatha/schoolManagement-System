// NEW-026 · Parent Help Desk
// Module: Events / PTM / Communication · Role: School Admin · Release: Extension
// New screen (no mock) — answers the parent app's Help & requests (PM-044…PM-046)
// Wired: GET /api/v1/school/parent-services/help-tickets (?status=), GET /help-tickets/{id}, POST /help-tickets/{id}/replies,
// POST /help-tickets/{id}/status; GET + PUT /school/parent-services/settings (communication and office hours). Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ParentHelpDesk } from "@/features/communication/ParentHelpDesk";

export const metadata = { title: "NEW-026 · Parent Help Desk · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-026">
      <ParentHelpDesk />
    </AppShell>
  );
}
