// SCR-255 · Communication History
// Module: Events / PTM / Communication · Role: School Admin · Release: Phase 3 · Stories: US-0509 / US-0510
// Mock: screens/SCR-255_Communication_History.html
// Backend: the old frontend served this at /school/notices/history — Delivery across notices, skipped kept apart from failed
// Wired: GET /api/v1/school/event-ops/history (from, to, channel). Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { CommunicationHistory, ExportHistoryButton } from "@/features/communication/CommunicationHistory";

export const metadata = { title: "SCR-255 · Communication History · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-255" actions={<ExportHistoryButton />}>
      <CommunicationHistory />
    </AppShell>
  );
}
