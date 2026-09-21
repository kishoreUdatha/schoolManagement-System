// SCR-256 · Document Repository
// Module: Documents & Certificates · Role: School Admin · Release: MVP · Stories: US-0511 / US-0512
// Mock: screens/SCR-256_Document_Repository.html
// Backend: the old frontend served this at /school/documents — Owner, category, verification and expiry
// Wired: GET /api/v1/school/documents, /documents/summary, /certificates, /staff, /directory/students, /documents/{id}/file; POST /documents (multipart); DELETE /documents/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { DocumentList } from "@/features/documents/DocumentList";

export const metadata = { title: "SCR-256 · Document Repository · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-256" actions={<a href="#upload" className="btn primary">
        <Icon name="check" className="sm" />
        Upload document
      </a>}>
      <Suspense>
        <DocumentList scope="all" />
      </Suspense>
    </AppShell>
  );
}
