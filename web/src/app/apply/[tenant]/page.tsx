// Online admission form reached by the short link /apply/<code> (public, no sign-in)
// Module: Admissions & Enquiries · Role: Parents and visitors · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/public/admissions/{code}; POST …/enquiries (default), …/applications (?form=application).
// The long /apply/<organization>/<school> link still works; this one is for an
// organization with a single school, so its code is not repeated. Hand-maintained.

import { Suspense } from "react";
import { AdmissionApply } from "@/features/public/AdmissionApply";

export const metadata = { title: "Admissions · BrightCampus" };

export default function Page({ params }: { params: { tenant: string } }) {
  return (
    <Suspense>
      <AdmissionApply tenant={decodeURIComponent(params.tenant)} />
    </Suspense>
  );
}
