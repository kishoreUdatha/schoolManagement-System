// Online admission form (public, no sign-in) · linked from NEW-001 Online Admission Link
// Module: Admissions & Enquiries · Role: Parents and visitors · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/public/admissions/{tenant_code}/{school_code}; POST …/enquiries (default), …/applications (?form=application). Hand-maintained.

import { Suspense } from "react";
import { AdmissionApply } from "@/features/public/AdmissionApply";

export const metadata = { title: "Admissions · BrightCampus" };

export default function Page({ params }: { params: { tenant: string; school: string } }) {
  return (
    <Suspense>
      <AdmissionApply tenant={decodeURIComponent(params.tenant)} school={decodeURIComponent(params.school)} />
    </Suspense>
  );
}
