// SCR-205 · Fine / Lost / Damaged Book
// Module: Library · Role: Librarian · Release: Phase 3 · Stories: US-0409 / US-0410
// Mock: screens/SCR-205_Fine_Lost_Damaged_Book.html
// Backend: the old frontend served this at /school/library — Collect, waive, bill; lost and damaged
// Wired: GET /api/v1/school/library/fines, POST /loans/{id}/fine, GET/PATCH /fines/{loan_id} (?loan=), POST /loans/{id}/lost. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { FineDesk } from "@/features/library/Desk";

export const metadata = { title: "SCR-205 · Fine / Lost / Damaged Book · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-205" actions={<button type="submit" form="lost-form" className="btn primary">
          <Icon name="check" className="sm" />
          Mark as lost
        </button>}>
      <Suspense>
        <FineDesk />
      </Suspense>
    </AppShell>
  );
}
