// SCR-147 · Bulk Marks Import
// Module: Examinations / Marks / Results · Role: Teacher · Release: Phase 2 · Stories: US-0293 / US-0294
// Mock: screens/SCR-147_Bulk_Marks_Import.html
// Backend: the old frontend served this at /teacher/marks/papers/[id]/import — Teacher uploads for their own paper, checked before written
// Wired: GET/POST /api/v1/teacher/mark-imports/papers/{id}/imports, POST /imports/{job}/commit, GET /template.csv, /imports/{job}/errors.csv, /teacher/marks/papers, /teacher/my-classes. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { BulkMarksImport } from "@/features/examinations/BulkMarksImport";

export const metadata = { title: "SCR-147 · Bulk Marks Import · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-147">
      <Suspense>
        <BulkMarksImport />
      </Suspense>
    </AppShell>
  );
}
