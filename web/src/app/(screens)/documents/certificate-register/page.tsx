// SCR-263 · Certificate Register
// Module: Documents & Certificates · Role: School Admin · Release: Phase 3 · Stories: US-0525 / US-0526
// Mock: screens/SCR-263_Certificate_Register.html
// Backend: the old frontend served this at /school/certificates — Serial, status, reprints, cancel
// Wired: GET /api/v1/school/certificates (status, kind), /certificates/{id}/pdf; POST /certificates/{id}/cancel, /certificates/{id}/decide (reject). Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { CertificateRegister, RegisterExport } from "@/features/documents/CertificateRegister";

export const metadata = { title: "SCR-263 · Certificate Register · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-263" actions={<>
        <RegisterExport />
        <Link href="/documents/generate-certificate" className="btn primary">
          <Icon name="arrow" className="sm" />
          Generate certificate
        </Link>
      </>}>
      <CertificateRegister />
    </AppShell>
  );
}
