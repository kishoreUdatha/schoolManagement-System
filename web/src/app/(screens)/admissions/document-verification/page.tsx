// SCR-051 · Document Verification
// Module: Admissions & Enquiries · Role: Admission Officer · Release: Phase 2 · Stories: US-0101 / US-0102
// Mock: screens/SCR-051_Document_Verification.html
// Wired: GET /api/v1/school/admissions/applications, /applications/{id} (?id=), /applications/documents/{doc}/file; POST /documents/{doc}/verify, /applications/{id}/documents, /applications/{id}/status. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { DocumentVerification } from "@/features/admissions/DocumentVerification";
import { ActionButton } from "@/features/admissions/shared";

export const metadata = { title: "SCR-051 · Document Verification · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-051" actions={<ActionButton name="complete-verification">Complete verification</ActionButton>}>
      <Suspense>
        <DocumentVerification />
      </Suspense>
    </AppShell>
  );
}
