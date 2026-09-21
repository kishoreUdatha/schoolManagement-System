// SCR-115 · Student Leave Approval
// Module: Student Attendance · Role: Class Teacher · Release: Phase 2 · Stories: US-0229 / US-0230
// Mock: screens/SCR-115_Student_Leave_Approval.html
// Wired: GET /api/v1/school/student-leaves (?status), POST /school/student-leaves/{id}/decide. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { LeaveApproval } from "@/features/attendance/LeaveApproval";
import { PageAction } from "@/features/attendance/shared";
import { EV } from "@/features/attendance/types";

export const metadata = { title: "SCR-115 · Student Leave Approval · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-115"
      actions={
        <PageAction event={EV.approveLeave} icon="check" primary>
          Approve leave
        </PageAction>
      }
    >
      <Suspense>
        <LeaveApproval />
      </Suspense>
    </AppShell>
  );
}
