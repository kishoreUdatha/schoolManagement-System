// SCR-078 · Parent Payments & Receipts
// Module: Parents & Guardians · Role: School Admin · Release: Phase 3 · Stories: US-0155 / US-0156
// Mock: screens/SCR-078_Parent_Payments_Receipts.html
// Backend: the old frontend served this at /school/parents/[id]/payments — Across all their children, not one at a time
// Wired: GET /api/v1/school/parents/{id} (?id=), /fees/student-fees, /accounts/collections per child, /parents/{id}/receipts/{collection}/pdf, /parents/{id}/ledger.pdf (api.open). Hand-maintained.

import { Suspense } from "react";
import { Icon } from "@/components/ui/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { ParentPayments } from "@/features/parents/ParentPayments";

export const metadata = { title: "SCR-078 · Parent Payments & Receipts · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-078" actions={<button type="button" className="btn" data-export="">
        <Icon name="download" className="sm" />
        Export
      </button>}>
      <Suspense>
        <ParentPayments />
      </Suspense>
    </AppShell>
  );
}
