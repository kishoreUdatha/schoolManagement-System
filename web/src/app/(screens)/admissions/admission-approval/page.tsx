// SCR-053 · Admission Approval
// Module: Admissions & Enquiries · Role: Admission Officer · Release: Phase 3 · Stories: US-0105 / US-0106
// Mock: screens/SCR-053_Admission_Approval.html
// Wired: GET /api/v1/school/admissions/applications, /applications/{id}; POST /applications/{id}/decide. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AdmissionApproval } from "@/features/admissions/AdmissionApproval";
import { ActionButton } from "@/features/admissions/shared";

export const metadata = { title: "SCR-053 · Admission Approval · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-053" actions={<ActionButton name="approve">Approve application</ActionButton>}>
      <Suspense>
        <AdmissionApproval />
      </Suspense>
    </AppShell>
  );
}
