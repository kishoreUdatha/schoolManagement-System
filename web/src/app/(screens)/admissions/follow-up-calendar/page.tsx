// SCR-047 · Follow-up Calendar
// Module: Admissions & Enquiries · Role: Admission Officer · Release: MVP · Stories: US-0093 / US-0094
// Mock: screens/SCR-047_Follow_up_Calendar.html
// Wired: GET /api/v1/school/admissions/enquiries?open_only=true by next_follow_up_date; POST /enquiries/{id}/activities. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { FollowUpCalendar, ScheduleLink } from "@/features/admissions/FollowUpCalendar";

export const metadata = { title: "SCR-047 · Follow-up Calendar · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-047" actions={<Suspense>
        <ScheduleLink />
      </Suspense>}>
      <Suspense>
        <FollowUpCalendar />
      </Suspense>
    </AppShell>
  );
}
