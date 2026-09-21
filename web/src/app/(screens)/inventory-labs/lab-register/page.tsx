// SCR-242 · Lab Register
// Module: Inventory / Assets / Labs · Role: Store Manager · Release: Phase 3 · Stories: US-0483 / US-0484
// Mock: screens/SCR-242_Lab_Register.html
// Backend: the old frontend served this at /school/facilities — Lab CRUD with room, subject, in-charge
// Wired: GET/POST /api/v1/school/labs, PUT/DELETE /labs/{id}, GET /rooms, /subjects, /directory/staff. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LabRegister } from "@/features/inventory/LabRegister";

export const metadata = { title: "SCR-242 · Lab Register · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-242" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/inventory-labs/lab-register?new=1" className="btn primary" scroll={false}>
          <Icon name="plus" className="sm" />
          Add lab
        </Link>
      </>}>
      <Suspense>
        <LabRegister />
      </Suspense>
    </AppShell>
  );
}
