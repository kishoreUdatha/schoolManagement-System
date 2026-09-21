// NEW-010 · Bulk Student Import
// Module: Students · Role: School Admin · Release: Extension
// New screen (no mock)
// Wired: POST /api/v1/school/students/bulk, GET /school/students/import-template.csv, /school/academic-years, /school/classes, /school/students (seats). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { BulkImport } from "@/features/students/BulkImport";

export const metadata = { title: "NEW-010 · Bulk Student Import · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-010">
      <Suspense>
        <BulkImport />
      </Suspense>
    </AppShell>
  );
}
