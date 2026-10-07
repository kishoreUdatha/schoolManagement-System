// NEW-104 · Hostel Report
// Module: Hostel · Role: Hostel Warden · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/school/hostels/report?month=. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { HostelReport } from "@/features/hostel/Report";

export const metadata = { title: "NEW-104 · Hostel Report · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-104">
      <HostelReport />
    </AppShell>
  );
}
