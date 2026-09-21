// SCR-074 · Link Children
// Module: Parents & Guardians · Role: School Admin · Release: MVP · Stories: US-0147 / US-0148
// Mock: screens/SCR-074_Link_Children.html
// Backend: the old frontend served this at /school/parents — Link and unlink children with relation
// Wired: GET /api/v1/school/parents/{id} (?id=), POST /parents/{id}/links, DELETE /parents/{id}/links/{student_id}, GET /students, /students/{id}/guardians. Hand-maintained.

import { Suspense } from "react";
import { Icon } from "@/components/ui/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { LinkChildren } from "@/features/parents/LinkChildren";

export const metadata = { title: "SCR-074 · Link Children · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-074" actions={<a href="#link-child" className="btn primary">
        <Icon name="check" className="sm" />
        Link child
      </a>}>
      <Suspense>
        <LinkChildren />
      </Suspense>
    </AppShell>
  );
}
