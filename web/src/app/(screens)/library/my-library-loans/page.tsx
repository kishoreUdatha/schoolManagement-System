// NEW-093 · My Library Loans
// Module: Library · Role: Staff · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /staff/library and /teacher/library
// Wired: GET /api/v1/staff/library. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { RoleGate } from "@/features/self/kit";
import { EMPLOYEES } from "@/features/self/roles";
import { MyLibraryLoans } from "@/features/self/MyLibraryLoans";

export const metadata = { title: "NEW-093 · My Library Loans · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-093"
    >
      <RoleGate roles={EMPLOYEES} message="This list shows books issued to a school employee. Sign in with an employee login to see your loans.">
        <Suspense>
          <MyLibraryLoans />
        </Suspense>
      </RoleGate>
    </AppShell>
  );
}
