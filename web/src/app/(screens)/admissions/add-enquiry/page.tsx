// SCR-045 · Add Enquiry
// Module: Admissions & Enquiries · Role: Admission Officer · Release: MVP · Stories: US-0089 / US-0090
// Mock: screens/SCR-045_Add_Enquiry.html
// Wired: POST /api/v1/school/admissions/enquiries (PATCH /enquiries/{id} with ?id=); GET /directory/staff, /api/v1/school/admissions/campaigns. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { EnquiryForm } from "@/features/admissions/EnquiryForm";

export const metadata = { title: "SCR-045 · Add Enquiry · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-045" actions={<button type="submit" form="enquiry-form" className="btn primary">
        <Icon name="check" className="sm" />
        Save enquiry
      </button>}>
      <Suspense>
        <EnquiryForm />
      </Suspense>
    </AppShell>
  );
}
