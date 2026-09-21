// NEW-080 · Approval Requests
// Module: Settings / Roles / Permissions / Audit · Role: Principal · Release: Extension
// New screen (no mock)
// Wired: GET/POST /api/v1/school/approvals (school admin); GET /api/v1/principal/approvals, POST /principal/approvals/{id}/decide (principal); GET /school/exams. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ApprovalRequests, NewApprovalButton } from "@/features/approvals/ApprovalRequests";

export const metadata = { title: "NEW-080 · Approval Requests · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-080" actions={<NewApprovalButton />}>
      <Suspense>
        <ApprovalRequests />
      </Suspense>
    </AppShell>
  );
}
