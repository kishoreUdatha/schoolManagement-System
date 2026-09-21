// SCR-283 · Custom Report Builder
// Module: Reports & Analytics · Role: School Admin · Release: Phase 3 · Stories: US-0565 / US-0566
// Mock: screens/SCR-283_Custom_Report_Builder.html
// Wired: GET /api/v1/school/report-sources, /report-definitions, /report-definitions/{id}, /classes, /exams; POST /report-definitions, POST /report-definitions/{id}/run, POST /report-definitions/{id}/export; PATCH/DELETE /report-definitions/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ReportBuilder } from "@/features/reports/ReportBuilder";

export const metadata = { title: "SCR-283 · Custom Report Builder · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-283" actions={<button type="submit" form="report-builder" className="btn primary">
        <Icon name="check" className="sm" />
        Run report
      </button>}>
      <Suspense>
        <ReportBuilder />
      </Suspense>
    </AppShell>
  );
}
