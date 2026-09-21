// SCR-262 · Transfer Certificate
// Module: Documents & Certificates · Role: School Admin · Release: Phase 3 · Stories: US-0523 / US-0524
// Mock: screens/SCR-262_Transfer_Certificate.html
// Backend: the old frontend served this at /school/certificates — Leaving date, conduct, dues check
// Wired: GET /api/v1/school/certificates?kind=transfer (?id=, ?request=), /certificates/templates, /profile, /students/{id}, /directory/students, /certificates/{id}/pdf; POST /certificates/preview, /certificates, /certificates/{id}/decide. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { TcActions, TransferCertificate } from "@/features/documents/TransferCertificate";

export const metadata = { title: "SCR-262 · Transfer Certificate · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-262" actions={<Suspense><TcActions /></Suspense>}>
      <Suspense>
        <TransferCertificate />
      </Suspense>
    </AppShell>
  );
}
