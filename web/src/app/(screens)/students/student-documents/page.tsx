// SCR-063 · Student Documents
// Module: Students · Role: School Admin · Release: Phase 2 · Stories: US-0125 / US-0126
// Mock: screens/SCR-063_Student_Documents.html
// Wired: GET /api/v1/school/documents?owner_type=student&owner_id={id}, GET /documents/{doc_id}/file, POST /documents (multipart), /students/{id} (?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { StudentDocuments } from "@/features/students/StudentDocuments";

export const metadata = { title: "SCR-063 · Student Documents · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-063"
      actions={
        <button type="submit" form="upload-document" className="btn primary">
          <Icon name="check" className="sm" />
          Upload document
        </button>
      }
    >
      <Suspense>
        <StudentDocuments />
      </Suspense>
    </AppShell>
  );
}
