"use client";

import { BorrowedBooks } from "@/components/library/BorrowedBooks";
import { PageHeader } from "@/components/ui/Field";

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="My library books" />
      <BorrowedBooks endpoint="/api/v1/staff/library" />
    </div>
  );
}
