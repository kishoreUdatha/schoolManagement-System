// SCR-161 · Student Ledger
// Module: Fees & Finance · Role: Accountant · Release: MVP · Stories: US-0321 / US-0322
// Mock: screens/SCR-161_Student_Ledger.html
// Backend: the old frontend served this at /school/fees/ledger/[studentId] — Derived running balance, fees and receipts in date order
// Wired: GET /api/v1/school/finance/ledger/{student_id} (?id=), /directory/students. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { StudentLedger } from "@/features/fees/StudentLedger";

export const metadata = { title: "SCR-161 · Student Ledger · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-161" actions={<button type="button" className="btn primary" data-export="">
        <Icon name="download" className="sm" />
        Download ledger
      </button>}>
      <Suspense>
        <StudentLedger />
      </Suspense>
    </AppShell>
  );
}
