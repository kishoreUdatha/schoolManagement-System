// SCR-046 · Enquiry Details
// Module: Admissions & Enquiries · Role: Admission Officer · Release: MVP · Stories: US-0091 / US-0092
// Mock: screens/SCR-046_Enquiry_Details.html
// Wired: GET /api/v1/school/admissions/enquiries/{id} (?id=); POST /enquiries/{id}/stage, /activities, /convert; GET /api/v1/school/admissions/applications. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { EnquiryDetails } from "@/features/admissions/EnquiryDetails";
import { ScheduleLink } from "@/features/admissions/FollowUpCalendar";

export const metadata = { title: "SCR-046 · Enquiry Details · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-046" actions={<Suspense>
        <ScheduleLink />
      </Suspense>}>
      <Suspense>
        <EnquiryDetails />
      </Suspense>
    </AppShell>
  );
}
