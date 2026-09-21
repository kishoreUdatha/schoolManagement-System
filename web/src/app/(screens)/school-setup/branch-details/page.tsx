// SCR-027 · Branch Details
// Module: Organization / School / Branch Setup · Role: Super Admin · Release: MVP · Stories: US-0053 / US-0054
// Mock: screens/SCR-027_Branch_Details.html
// Wired: GET /api/v1/school/branches (?id=), PUT /branches/{id}/sections|staff, DELETE /branches/{id}, GET /classes, /staff, /academic-years, /profile, /audit-log. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { BranchDetails } from "@/features/setup/Branches";
import { WithIdLink } from "@/features/setup/bits";

export const metadata = { title: "SCR-027 · Branch Details · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-027"
      actions={
        <Suspense>
          <WithIdLink screen={26} fallback={25}>
            Edit branch
          </WithIdLink>
        </Suspense>
      }
    >
      <Suspense>
        <BranchDetails />
      </Suspense>
    </AppShell>
  );
}
