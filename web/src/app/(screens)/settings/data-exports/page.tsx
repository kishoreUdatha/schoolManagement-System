// NEW-081 · Data Exports
// Module: Settings / Roles / Permissions / Audit · Role: School Admin · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/school/exports/{students,staff,fees,marks,homework,behaviour}.csv, /school/analytics/{strength,fee-collection,dues-ageing,chronic-absence}.csv, /school/reports/attendance/{class-summary,daily-absent,student-monthly}.csv; GET /school/export-jobs, /export-jobs/{id}, /export-jobs/{id}/file; POST /report-definitions/{id}/export; GET /academic-years, /classes, /exams, /report-definitions. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { DataExports } from "@/features/exports/DataExports";

export const metadata = { title: "NEW-081 · Data Exports · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-081"
      actions={
        <button type="submit" form="export-form" className="btn primary">
          <Icon name="download" className="sm" />
          Download CSV
        </button>
      }
    >
      <Suspense>
        <DataExports />
      </Suspense>
    </AppShell>
  );
}
