// SCR-257 · Student Documents
// Module: Documents & Certificates · Role: School Admin · Release: MVP · Stories: US-0513 / US-0514
// Mock: screens/SCR-257_Student_Documents.html
// Backend: the old frontend served this at /school/documents/students — Expiring and unverified visible at a glance
// Wired: GET /api/v1/school/documents?owner_type=student (&owner_id from ?id=), /documents/summary, /certificates, /students/{id}, /directory/students, /documents/{id}/file; POST /documents (multipart); DELETE /documents/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { DocumentList } from "@/features/documents/DocumentList";

export const metadata = { title: "SCR-257 · Student Documents · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-257" actions={<a href="#upload" className="btn primary">
        <Icon name="check" className="sm" />
        Upload document
      </a>}>
      <Suspense>
        <DocumentList scope="student" />
      </Suspense>
    </AppShell>
  );
}
