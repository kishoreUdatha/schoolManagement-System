// NEW-091 · My Leave
// Module: HR / Leave / Payroll · Role: Staff · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /teacher/leaves (apply, change, cancel)
// Wired: GET/POST /api/v1/staff/leaves, PATCH /staff/leaves/{id}, POST /staff/leaves/{id}/cancel, GET /staff/leaves/balances (?year=), GET /staff/leaves/types. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageAction, RoleGate } from "@/features/self/kit";
import { LEAVE_APPLICANTS } from "@/features/self/roles";
import { MyLeave } from "@/features/self/MyLeave";

export const metadata = { title: "NEW-091 · My Leave · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-091"
      actions={
        <PageAction name="apply" icon="calendar" roles={LEAVE_APPLICANTS}>
          Apply for leave
        </PageAction>
      }
    >
      <RoleGate roles={LEAVE_APPLICANTS} message="Leave is applied for by school employees. Sign in with an employee login to apply for your own leave.">
        <Suspense>
          <MyLeave />
        </Suspense>
      </RoleGate>
    </AppShell>
  );
}
