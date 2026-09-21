// SCR-043 · Admission / Enquiry Dashboard
// Module: Admissions & Enquiries · Role: Admission Officer · Release: MVP · Stories: US-0085 / US-0086
// Mock: screens/SCR-043_Admission_Enquiry_Dashboard.html
// Wired: GET /api/v1/school/admissions/stats, /api/v1/school/admissions/applications/funnel, /api/v1/school/admissions/enquiries?open_only=true, /api/v1/school/admissions/applications. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { AdmissionDashboard } from "@/features/admissions/AdmissionDashboard";

export const metadata = { title: "SCR-043 · Admission / Enquiry Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-043" actions={<Link href="/admissions/add-enquiry" className="btn primary">
        <Icon name="plus" className="sm" />
        Add enquiry
      </Link>}>
      <Suspense>
        <AdmissionDashboard />
      </Suspense>
    </AppShell>
  );
}
