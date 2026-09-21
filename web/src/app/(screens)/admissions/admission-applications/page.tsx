// SCR-048 · Admission Applications
// Module: Admissions & Enquiries · Role: Admission Officer · Release: MVP · Stories: US-0095 / US-0096
// Mock: screens/SCR-048_Admission_Applications.html
// Wired: GET /api/v1/school/admissions/applications (status, search, academic_year_id). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ApplicationList } from "@/features/admissions/ApplicationList";
import { ExportButton } from "@/features/admissions/ExportButton";

export const metadata = { title: "SCR-048 · Admission Applications · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-048" actions={<>
        <ExportButton name="export-applications" />
        <Link href="/admissions/new-admission-application" className="btn primary">
          <Icon name="plus" className="sm" />
          New application
        </Link>
      </>}>
      <Suspense>
        <ApplicationList />
      </Suspense>
    </AppShell>
  );
}
