// SCR-049 · New Admission Application
// Module: Admissions & Enquiries · Role: Admission Officer · Release: MVP · Stories: US-0097 / US-0098
// Mock: screens/SCR-049_New_Admission_Application.html
// Wired: POST /api/v1/school/admissions/applications (?submitted, ?enquiry_id), multipart POST /applications/{id}/documents; with ?id= edits: GET/PUT /applications/{id}, POST /applications/{id}/submit, GET /applications/documents/{doc}/file, DELETE /applications/documents/{doc}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ApplicationForm, ApplicationFormAction } from "@/features/admissions/ApplicationForm";

export const metadata = { title: "SCR-049 · New Admission Application · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-049"
      actions={
        <Suspense
          fallback={
            <button type="submit" form="application-form" className="btn primary">
              <Icon name="check" className="sm" />
              Submit application
            </button>
          }
        >
          <ApplicationFormAction />
        </Suspense>
      }
    >
      <Suspense>
        <ApplicationForm />
      </Suspense>
    </AppShell>
  );
}
