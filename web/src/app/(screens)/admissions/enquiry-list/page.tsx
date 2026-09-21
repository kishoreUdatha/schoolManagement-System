// SCR-044 · Enquiry List
// Module: Admissions & Enquiries · Role: Admission Officer · Release: MVP · Stories: US-0087 / US-0088
// Mock: screens/SCR-044_Enquiry_List.html
// Wired: GET /api/v1/school/admissions/enquiries (stage, source, follow_up_due, search, page), /api/v1/school/admissions/stats. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { EnquiryList } from "@/features/admissions/EnquiryList";
import { ExportButton } from "@/features/admissions/ExportButton";

export const metadata = { title: "SCR-044 · Enquiry List · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-044" actions={<>
        <ExportButton name="export-enquiries" />
        <Link href="/admissions/add-enquiry" className="btn primary">
          <Icon name="plus" className="sm" />
          Add enquiry
        </Link>
      </>}>
      <Suspense>
        <EnquiryList />
      </Suspense>
    </AppShell>
  );
}
