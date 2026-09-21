// SCR-202 · Issue Book
// Module: Library · Role: Librarian · Release: Phase 2 · Stories: US-0403 / US-0404
// Mock: screens/SCR-202_Issue_Book.html
// Backend: the old frontend served this at /school/library — Borrower and accession scan with due date
// Wired: POST /api/v1/school/library/loans; GET /library/settings, /library/members, /library/loans, /students (search), /directory/staff. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { IssueBook } from "@/features/library/Desk";

export const metadata = { title: "SCR-202 · Issue Book · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-202" actions={<button type="submit" form="issue-form" className="btn primary">
          <Icon name="check" className="sm" />
          Issue book
        </button>}>
      <Suspense>
        <IssueBook />
      </Suspense>
    </AppShell>
  );
}
