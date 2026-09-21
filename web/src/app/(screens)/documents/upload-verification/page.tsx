// SCR-259 · Upload & Verification
// Module: Documents & Certificates · Role: School Admin · Release: Phase 2 · Stories: US-0517 / US-0518
// Mock: screens/SCR-259_Upload_Verification.html
// Backend: the old frontend served this at /school/documents — Upload, verify, reject with reason
// Wired: GET /api/v1/school/documents (?doc=), /documents/summary, /documents/{id}/file; POST /documents/{id}/verify. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { DocumentList } from "@/features/documents/DocumentList";

export const metadata = { title: "SCR-259 · Upload & Verification · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-259" actions={<a href="#verification" className="btn primary">
        <Icon name="check" className="sm" />
        Verify documents
      </a>}>
      <Suspense>
        <DocumentList scope="review" />
      </Suspense>
    </AppShell>
  );
}
