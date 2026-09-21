// SCR-243 · Lab Equipment & Consumables
// Module: Inventory / Assets / Labs · Role: Store Manager · Release: Phase 3 · Stories: US-0485 / US-0486
// Mock: screens/SCR-243_Lab_Equipment_Consumables.html
// Backend: the old frontend served this at /school/inventory/labs — Equipment is free text; says so and points at the store
// Wired: GET /api/v1/school/inventory/items, /labs. Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LabEquipment } from "@/features/inventory/LabEquipment";

export const metadata = { title: "SCR-243 · Lab Equipment & Consumables · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-243" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/inventory-labs/item-catalogue?new=1" className="btn primary">
          <Icon name="plus" className="sm" />
          Add equipment
        </Link>
      </>}>
      <LabEquipment />
    </AppShell>
  );
}
