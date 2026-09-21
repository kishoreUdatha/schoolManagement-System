// SCR-201 · Library Members
// Module: Library · Role: Librarian · Release: Phase 2 · Stories: US-0401 / US-0402
// Mock: screens/SCR-201_Library_Members.html
// Backend: the old frontend served this at /school/library/members — Who holds what, with limit and can-borrow
// Wired: GET /api/v1/school/library/members (q, with_books_only), /library/loans (student_id | user_id). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { MemberList } from "@/features/library/Catalogue";

export const metadata = { title: "SCR-201 · Library Members · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-201" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/library/issue-book" className="btn primary">
          <Icon name="plus" className="sm" />
          Issue a book
        </Link>
      </>}>
      <Suspense>
        <MemberList />
      </Suspense>
    </AppShell>
  );
}
