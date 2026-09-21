// NEW-012 · Enrolment History
// Module: Students · Role: School Admin · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/school/enrollments?academic_year_id&section_id, GET /school/students/{id}/enrollments (?id=), PATCH /school/enrollments/{id}, /school/academic-years, /school/classes. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { EnrolmentHistory } from "@/features/students/EnrolmentHistory";

export const metadata = { title: "NEW-012 · Enrolment History · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-012">
      <Suspense>
        <EnrolmentHistory />
      </Suspense>
    </AppShell>
  );
}
