// SCR-162 · Outstanding Dues
// Module: Fees & Finance · Role: Accountant · Release: Phase 2 · Stories: US-0323 / US-0324
// Mock: screens/SCR-162_Outstanding_Dues.html
// Backend: the old frontend served this at /school/fees/dues — Ageing buckets with the reminder run
// Wired: GET /api/v1/school/analytics/dues-ageing (+ .csv), GET /school/fees/reminders, POST /school/fees/reminders/run. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { DownloadButton } from "@/features/fees/common";
import { OutstandingDues } from "@/features/fees/OutstandingDues";

export const metadata = { title: "SCR-162 · Outstanding Dues · BrightCampus" };

export default function Page() {
  // "Send reminder" runs the school's reminder job, so it sits with the live list in the filter bar.
  return (
    <AppShell screen="SCR-162" actions={<DownloadButton path="/api/v1/school/analytics/dues-ageing.csv" filename="outstanding-dues.csv">
        Export
      </DownloadButton>}>
      <OutstandingDues />
    </AppShell>
  );
}
