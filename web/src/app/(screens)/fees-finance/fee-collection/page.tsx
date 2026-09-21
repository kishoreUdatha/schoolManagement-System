// SCR-158 · Fee Collection
// Module: Fees & Finance · Role: Accountant · Release: MVP · Stories: US-0315 / US-0316
// Mock: screens/SCR-158_Fee_Collection.html
// Backend: the old frontend served this at /school/fees — Record payment with mode and reference
// Wired: GET /api/v1/school/fees/student-fees, POST /fees/student-fees/{id}/record-payment, GET /accounts/collections, /directory/students, /students/{id} (?student=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { FeeCollection } from "@/features/fees/FeeCollection";

export const metadata = { title: "SCR-158 · Fee Collection · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-158" actions={<button type="submit" form="fee-collection-form" className="btn primary">
        <Icon name="check" className="sm" />
        Record payment
      </button>}>
      <Suspense>
        <FeeCollection />
      </Suspense>
    </AppShell>
  );
}
