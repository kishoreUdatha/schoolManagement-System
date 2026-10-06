// NEW-099 · Budget
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock)
// Wired: GET/PUT /api/v1/school/books/budget, POST …/budget/copy. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { Budget } from "@/features/books/Budget";

export const metadata = { title: "NEW-099 · Budget · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-099">
      <ClientOnly>
        <Budget />
      </ClientOnly>
    </AppShell>
  );
}
