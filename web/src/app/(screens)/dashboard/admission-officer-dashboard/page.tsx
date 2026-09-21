// SCR-040 · Admission Officer Dashboard
// Module: Role Dashboards · Role: Admission Officer · Release: Phase 3 · Stories: US-0079 / US-0080
// Mock: screens/SCR-040_Admission_Officer_Dashboard.html
// Backend: the old frontend served this at /staff — Admissions panel, shown to whoever holds admissions.manage
// Wired: GET /api/v1/staff/dashboard (admissions panel), GET /api/v1/staff/inbox, GET /api/v1/staff/attendance/today. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { AdmissionOfficerDashboard } from "@/features/dashboards/StaffDashboards";

export const metadata = { title: "SCR-040 · Admission Officer Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-040" actions={<Link href="/admissions/add-enquiry" className="btn primary">
        <Icon name="plus" className="sm" />
        Add enquiry
      </Link>}>
      <Suspense>
        <AdmissionOfficerDashboard />
      </Suspense>
    </AppShell>
  );
}
