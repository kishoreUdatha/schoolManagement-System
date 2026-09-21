// SCR-157 · Student Fee Assignment
// Module: Fees & Finance · Role: Accountant · Release: MVP · Stories: US-0313 / US-0314
// Mock: screens/SCR-157_Student_Fee_Assignment.html
// Backend: the old frontend served this at /school/fees/assignments — Names an absolute amount or adds a head; concessions still subtract
// Wired: GET/POST /api/v1/school/finance/assignments, PATCH /finance/assignments/{id}, POST /finance/assignments/{id}/apply, GET /fees/heads, /academic-years, /directory/students. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { FeeAssignments } from "@/features/fees/FeeAssignments";

export const metadata = { title: "SCR-157 · Student Fee Assignment · BrightCampus" };

export default function Page() {
  // "Assign fees" sits in the filter bar: it opens a live form, which a page-head button (server-rendered) cannot.
  return (
    <AppShell screen="SCR-157">
      <ClientOnly>
        <FeeAssignments />
      </ClientOnly>
    </AppShell>
  );
}
