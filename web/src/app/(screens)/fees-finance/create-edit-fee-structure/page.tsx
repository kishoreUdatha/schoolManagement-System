// SCR-156 · Create / Edit Fee Structure
// Module: Fees & Finance · Role: Accountant · Release: MVP · Stories: US-0311 / US-0312
// Mock: screens/SCR-156_Create_Edit_Fee_Structure.html
// Backend: the old frontend served this at /school/fees/structures — Amount, due day, recurring flag
// Wired: GET/POST /api/v1/school/fees/structures, PATCH/DELETE /fees/structures/{id}, GET /fees/heads, /classes, /academic-years (?year=&class=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { FeeStructureForm } from "@/features/fees/FeeStructureForm";

export const metadata = { title: "SCR-156 · Create / Edit Fee Structure · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-156" actions={<button type="submit" form="fee-structure-form" className="btn primary">
        <Icon name="check" className="sm" />
        Save fee structure
      </button>}>
      <Suspense>
        <FeeStructureForm />
      </Suspense>
    </AppShell>
  );
}
