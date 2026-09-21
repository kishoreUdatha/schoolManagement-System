// SCR-261 · Generate Certificate
// Module: Documents & Certificates · Role: School Admin · Release: Phase 3 · Stories: US-0521 / US-0522
// Mock: screens/SCR-261_Generate_Certificate.html
// Backend: the old frontend served this at /school/certificates — Template and student with live preview
// Wired: GET /api/v1/school/certificates/templates, /academic-years, /directory/students, /certificates?status=requested (?request=); POST /certificates/preview, /certificates, /certificates/{id}/decide; GET /certificates/{id}/pdf. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { GenerateCertificate } from "@/features/documents/GenerateCertificate";

export const metadata = { title: "SCR-261 · Generate Certificate · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-261" actions={<button type="submit" form="certificate-form" className="btn primary">
        <Icon name="check" className="sm" />
        Generate preview
      </button>}>
      <Suspense>
        <GenerateCertificate />
      </Suspense>
    </AppShell>
  );
}
