// SCR-168 · Vendor Management
// Module: Fees & Finance · Role: Accountant · Release: Phase 3 · Stories: US-0335 / US-0336
// Mock: screens/SCR-168_Vendor_Management.html
// Backend: the old frontend served this at /school/purchasing/vendors — Payables derived from bills minus payments
// Wired: GET /api/v1/school/finance/payables, GET/POST /school/inventory/suppliers, PUT /inventory/suppliers/{id}. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { Vendors } from "@/features/fees/Vendors";

export const metadata = { title: "SCR-168 · Vendor Management · BrightCampus" };

export default function Page() {
  // "Add vendor" opens a live form, so it sits in the filter bar.
  return (
    <AppShell screen="SCR-168" actions={<button type="button" className="btn" data-export="">
        <Icon name="download" className="sm" />
        Export
      </button>}>
      <Vendors />
    </AppShell>
  );
}
