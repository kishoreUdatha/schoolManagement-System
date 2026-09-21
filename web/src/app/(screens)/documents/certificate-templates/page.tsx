// SCR-260 · Certificate Templates
// Module: Documents & Certificates · Role: School Admin · Release: Phase 2 · Stories: US-0519 / US-0520
// Mock: screens/SCR-260_Certificate_Templates.html
// Backend: the old frontend served this at /school/certificates/templates — Six kinds with placeholders and serials
// Wired: GET /api/v1/school/certificates/templates, /certificates/placeholders; POST /certificates/templates; PATCH /certificates/templates/{id}. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { CertificateTemplates } from "@/features/documents/CertificateTemplates";

export const metadata = { title: "SCR-260 · Certificate Templates · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-260" actions={<Link href="/documents/certificate-templates?new=1" className="btn primary">
        <Icon name="plus" className="sm" />
        Create template
      </Link>}>
      <Suspense>
        <CertificateTemplates />
      </Suspense>
    </AppShell>
  );
}
