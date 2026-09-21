// SCR-062 · Student Fees & Ledger
// Module: Students · Role: School Admin · Release: MVP · Stories: US-0123 / US-0124
// Mock: screens/SCR-062_Student_Fees_Ledger.html
// Wired: GET /api/v1/school/finance/ledger/{id}, /students/{id} (?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { CollectFeeLink, StudentLedger } from "@/features/students/StudentLedger";

export const metadata = { title: "SCR-062 · Student Fees & Ledger · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-062"
      actions={
        <Suspense>
          <CollectFeeLink />
        </Suspense>
      }
    >
      <Suspense>
        <StudentLedger />
      </Suspense>
    </AppShell>
  );
}
