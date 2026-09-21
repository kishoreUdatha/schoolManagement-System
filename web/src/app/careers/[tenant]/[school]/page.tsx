// Careers page (public, no sign-in) · linked from NEW-001 Online Admission Link and SCR-173 Job Openings
// Module: HR / Leave / Payroll · Role: Job seekers · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/public/careers/{tenant_code}/{school_code}, …/openings; POST …/openings/{id}/apply. Hand-maintained.

import { Suspense } from "react";
import { Careers } from "@/features/public/Careers";

export const metadata = { title: "Careers · BrightCampus" };

export default function Page({ params }: { params: { tenant: string; school: string } }) {
  return (
    <Suspense>
      <Careers tenant={decodeURIComponent(params.tenant)} school={decodeURIComponent(params.school)} />
    </Suspense>
  );
}
