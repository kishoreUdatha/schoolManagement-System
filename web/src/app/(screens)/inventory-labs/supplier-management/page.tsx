// SCR-238 · Supplier Management
// Module: Inventory / Assets / Labs · Role: Store Manager · Release: Phase 2 · Stories: US-0475 / US-0476
// Mock: screens/SCR-238_Supplier_Management.html
// Backend: the old frontend served this at /school/inventory — Supplier CRUD with contact and GSTIN
// Wired: GET/POST /api/v1/school/inventory/suppliers, PUT /inventory/suppliers/{id}. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { SupplierManagement } from "@/features/inventory/SupplierManagement";

export const metadata = { title: "SCR-238 · Supplier Management · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-238" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/inventory-labs/supplier-management?new=1" className="btn primary" scroll={false}>
          <Icon name="plus" className="sm" />
          Add supplier
        </Link>
      </>}>
      <Suspense>
        <SupplierManagement />
      </Suspense>
    </AppShell>
  );
}
