// SCR-206 · Digital Library
// Module: Library · Role: Librarian · Release: Phase 3 · Stories: US-0411 / US-0412
// Mock: screens/SCR-206_Digital_Library.html
// Backend: the old frontend served this at /school/library/digital — A catalogue of links, stated as such; no reader exists
// Wired: GET /api/v1/school/library/books?digital_only=true, /library/categories. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { DigitalLibrary } from "@/features/library/Catalogue";

export const metadata = { title: "SCR-206 · Digital Library · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-206" actions={<Link href="/library/add-edit-book" className="btn primary">
          <Icon name="plus" className="sm" />
          Add resource
        </Link>}>
      <Suspense>
        <DigitalLibrary />
      </Suspense>
    </AppShell>
  );
}
