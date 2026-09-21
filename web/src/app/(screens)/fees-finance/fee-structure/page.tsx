// SCR-155 · Fee Structure
// Module: Fees & Finance · Role: Accountant · Release: MVP · Stories: US-0309 / US-0310
// Mock: screens/SCR-155_Fee_Structure.html
// Backend: the old frontend served this at /school/fees/structures — Per class, head and year
// Wired: GET /api/v1/school/fees/structures, /fees/heads, /classes, /academic-years. Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { FeeStructureList } from "@/features/fees/FeeStructureList";

export const metadata = { title: "SCR-155 · Fee Structure · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-155" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/fees-finance/create-edit-fee-structure" className="btn primary">
          <Icon name="plus" className="sm" />
          Create fee structure
        </Link>
      </>}>
      <FeeStructureList />
    </AppShell>
  );
}
