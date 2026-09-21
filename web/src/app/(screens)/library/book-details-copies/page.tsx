// SCR-200 · Book Details & Copies
// Module: Library · Role: Librarian · Release: Phase 2 · Stories: US-0399 / US-0400
// Mock: screens/SCR-200_Book_Details_Copies.html
// Backend: the old frontend served this at /school/library/catalogue/[id] — Copies table, statuses, add copies
// Wired: GET /api/v1/school/library/books/{id} (?id=), POST /books/{id}/copies, PATCH /library/copies/{id}. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { BookDetails } from "@/features/library/Catalogue";

export const metadata = { title: "SCR-200 · Book Details & Copies · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-200" actions={<Link href="/library/issue-book" className="btn primary">
          <Icon name="arrow" className="sm" />
          Issue copy
        </Link>}>
      <Suspense>
        <BookDetails />
      </Suspense>
    </AppShell>
  );
}
