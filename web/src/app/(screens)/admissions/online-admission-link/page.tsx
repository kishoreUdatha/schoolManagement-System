// NEW-001 · Online Admission Link
// Module: Admissions & Enquiries · Role: School Admin · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/school/admissions/public-link; GET /api/v1/public/admissions/{tenant}/{school}, /public/careers/{tenant}/{school}/openings. Links to /apply/… and /careers/…. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { OnlineAdmissionLink } from "@/features/admissions/OnlineAdmissionLink";
import { routeOf } from "@/lib/screens";

export const metadata = { title: "NEW-001 · Online Admission Link · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-001"
      actions={
        <Link href={routeOf(44)} className="btn primary">
          <Icon name="arrow" className="sm" />
          Enquiry list
        </Link>
      }
    >
      <Suspense>
        <OnlineAdmissionLink />
      </Suspense>
    </AppShell>
  );
}
