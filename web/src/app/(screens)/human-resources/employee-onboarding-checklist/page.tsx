// SCR-178 · Employee Onboarding Checklist
// Module: HR / Leave / Payroll · Role: HR · Release: Phase 2 · Stories: US-0355 / US-0356
// Mock: screens/SCR-178_Employee_Onboarding_Checklist.html
// Backend: the old frontend served this at /school/staff/onboarding — Standard tasks laid out, none assumed done
// Wired: GET /api/v1/school/hr-ops/onboarding/outstanding, GET/POST /hr-ops/onboarding/{staff_id} (?id=), POST …/{staff_id}/tasks, POST /hr-ops/onboarding/tasks/{id}, POST …/{staff_id}/complete ("Complete onboarding", in the Completion panel); GET /staff. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Onboarding } from "@/features/hr/Onboarding";
import { PageAction } from "@/features/hr/ui";

export const metadata = { title: "SCR-178 · Employee Onboarding Checklist · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-178" actions={<PageAction>Add task</PageAction>}>
      <Suspense>
        <Onboarding />
      </Suspense>
    </AppShell>
  );
}
