// SCR-087 · Qualifications & Documents
// Module: Teachers & Staff · Role: School Admin · Release: Phase 2 · Stories: US-0173 / US-0174
// Mock: screens/SCR-087_Qualifications_Documents.html
// Wired: GET/POST /api/v1/school/staff-ops/{id}/qualifications (?id=), POST …/qualifications/{id}/verify, DELETE …/qualifications/{id}, POST /documents (multipart), GET /documents/{id}/file. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SaveQualificationAction, StaffQualifications } from "@/features/staff/StaffQualifications";

export const metadata = { title: "SCR-087 · Qualifications & Documents · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-087"
      actions={
        <Suspense>
          <SaveQualificationAction />
        </Suspense>
      }
    >
      <Suspense>
        <StaffQualifications />
      </Suspense>
    </AppShell>
  );
}
