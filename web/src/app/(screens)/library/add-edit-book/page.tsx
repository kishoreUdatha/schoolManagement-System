// SCR-199 · Add / Edit Book
// Module: Library · Role: Librarian · Release: Phase 2 · Stories: US-0397 / US-0398
// Mock: screens/SCR-199_Add_Edit_Book.html
// Backend: the old frontend served this at /school/library/catalogue — Book form with initial copies and price
// Wired: POST /api/v1/school/library/books; GET + PATCH /library/books/{id} (?id=); GET /library/categories. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { BookForm } from "@/features/library/Catalogue";

export const metadata = { title: "SCR-199 · Add / Edit Book · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-199" actions={<button type="submit" form="book-form" className="btn primary">
          <Icon name="check" className="sm" />
          Save book
        </button>}>
      <Suspense>
        <BookForm />
      </Suspense>
    </AppShell>
  );
}
