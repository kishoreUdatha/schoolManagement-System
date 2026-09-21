// SCR-258 · Staff Documents
// Module: Documents & Certificates · Role: HR · Release: Phase 2 · Stories: US-0515 / US-0516
// Mock: screens/SCR-258_Staff_Documents.html
// Backend: the old frontend served this at /school/documents/staff — Same view, filtered to staff
// Wired: GET /api/v1/school/documents?owner_type=staff (&owner_id from ?id=), /documents/summary, /certificates, /staff, /documents/{id}/file; POST /documents (multipart); DELETE /documents/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { DocumentList } from "@/features/documents/DocumentList";

export const metadata = { title: "SCR-258 · Staff Documents · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-258" actions={<a href="#upload" className="btn primary">
        <Icon name="check" className="sm" />
        Upload document
      </a>}>
      <Suspense>
        <DocumentList scope="staff" />
      </Suspense>
    </AppShell>
  );
}
