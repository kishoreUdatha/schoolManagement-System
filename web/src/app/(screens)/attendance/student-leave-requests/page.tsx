// SCR-114 · Student Leave Requests
// Module: Student Attendance · Role: Teacher · Release: MVP · Stories: US-0227 / US-0228
// Mock: screens/SCR-114_Student_Leave_Requests.html
// Wired: GET /api/v1/parent/me/children, GET + POST /parent/me/children/{id}/leaves, POST …/leaves/{leave_id}/cancel (parent portal). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { LeaveRequests } from "@/features/attendance/LeaveRequests";
import { PageAction } from "@/features/attendance/shared";
import { EV } from "@/features/attendance/types";

export const metadata = { title: "SCR-114 · Student Leave Requests · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-114"
      actions={
        <>
          <PageAction event={EV.exportLeaves} icon="download">
            Export
          </PageAction>
          <PageAction event={EV.requestLeave} icon="check" primary>
            Request leave
          </PageAction>
        </>
      }
    >
      <Suspense>
        <LeaveRequests />
      </Suspense>
    </AppShell>
  );
}
