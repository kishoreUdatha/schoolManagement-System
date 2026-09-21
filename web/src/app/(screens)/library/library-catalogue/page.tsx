// SCR-198 · Library Catalogue
// Module: Library · Role: Librarian · Release: Phase 2 · Stories: US-0395 / US-0396
// Mock: screens/SCR-198_Library_Catalogue.html
// Backend: the old frontend served this at /school/library/catalogue — Search with category and shelf filters
// Wired: GET /api/v1/school/library/books (q, category, available_only, include_inactive), /library/categories, /library/dashboard. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { CatalogueBrowser } from "@/features/library/Catalogue";

export const metadata = { title: "SCR-198 · Library Catalogue · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-198" actions={<Link href="/library/add-edit-book" className="btn primary">
          <Icon name="plus" className="sm" />
          Add book
        </Link>}>
      <Suspense>
        <CatalogueBrowser />
      </Suspense>
    </AppShell>
  );
}
