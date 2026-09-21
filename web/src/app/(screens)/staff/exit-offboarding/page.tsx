// SCR-091 · Exit / Offboarding
// Module: Teachers & Staff · Role: School Admin · Release: Phase 3 · Stories: US-0181 / US-0182
// Mock: screens/SCR-091_Exit_Offboarding.html
// Wired: GET /api/v1/school/staff-ops/{id}/exit (?id=), POST /staff-ops/clearances, …/items/{id}, …/{id}/complete, …/{id}/cancel, GET …/{id}/profile. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { WithStaffLink } from "@/features/staff/StaffProfile";
import { StaffExit } from "@/features/staff/StaffExit";

export const metadata = { title: "SCR-091 · Exit / Offboarding · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-091"
      actions={
        <Suspense>
          <WithStaffLink screen={82} icon="arrow" primary={false}>
            Staff profile
          </WithStaffLink>
        </Suspense>
      }
    >
      <Suspense>
        <StaffExit />
      </Suspense>
    </AppShell>
  );
}
