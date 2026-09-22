// SCR-074 · Link Children
// Module: Parents & Guardians · Role: School Admin · Release: MVP · Stories: US-0147 / US-0148
// Mock: screens/SCR-074_Link_Children.html
// Backend: the old frontend served this at /school/parents — Link and unlink children with relation
// Wired: GET /api/v1/school/parents/{id} (?id=), POST /parents/{id}/links, DELETE /parents/{id}/links/{student_id}, GET /students, /students/{id}/guardians;
// parents' link requests: GET /api/v1/school/parent-services/requests?kind=link_child, POST /requests/{id}/decide. Hand-maintained.

import { Suspense } from "react";
import { Icon } from "@/components/ui/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { LinkChildren } from "@/features/parents/LinkChildren";
import { ParentRequestsPanel } from "@/features/parents/ParentRequestsPanel";

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
      <ParentRequestsPanel
        title="Link requests from parents"
        sub="Sent from the parent app. Approving links the child whose admission number and date of birth match."
        list="/api/v1/school/parent-services/requests"
        kind="link_child"
      />
    </AppShell>
  );
}
