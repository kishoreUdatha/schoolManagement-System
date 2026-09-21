// SCR-203 · Return Book
// Module: Library · Role: Librarian · Release: Phase 3 · Stories: US-0405 / US-0406
// Mock: screens/SCR-203_Return_Book.html
// Backend: the old frontend served this at /school/library — Return with damage flag and fine
// Wired: GET /api/v1/school/library/loans?open_only=true (find by accession), POST /library/loans/{id}/return. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ReturnBook } from "@/features/library/Desk";

export const metadata = { title: "SCR-203 · Return Book · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-203" actions={<button type="submit" form="return-form" className="btn primary">
          <Icon name="check" className="sm" />
          Confirm return
        </button>}>
      <Suspense>
        <ReturnBook />
      </Suspense>
    </AppShell>
  );
}
