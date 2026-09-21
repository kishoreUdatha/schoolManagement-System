// SCR-207 · Library Reports
// Module: Library · Role: Librarian · Release: Phase 3 · Stories: US-0413 / US-0414
// Mock: screens/SCR-207_Library_Reports.html
// Backend: the old frontend served this at /school/library/reports — Date-ranged issues, returns and fines
// Wired: GET /api/v1/school/analytics/library (from, to), /library/fines, /library/books, /library/loans?overdue_only=true. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LibraryReports } from "@/features/library/Catalogue";

export const metadata = { title: "SCR-207 · Library Reports · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-207" actions={<button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>}>
      <Suspense>
        <LibraryReports />
      </Suspense>
    </AppShell>
  );
}
