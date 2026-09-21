// SCR-228 · Visitor Approval
// Module: Visitor / Gate / Security · Role: Security · Release: Phase 2 · Stories: US-0455 / US-0456
// Mock: screens/SCR-228_Visitor_Approval.html
// Backend: the old frontend served this at /school/front-desk — Host confirms or declines an expected visitor
// Wired: GET /api/v1/school/front-desk/visits (on, q); POST /visits/{id}/host-decision, /check-in, /deny, /cancel. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { VisitorApproval } from "@/features/security/FrontDesk";

export const metadata = { title: "SCR-228 · Visitor Approval · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-228" actions={<Link href="/campus-security/visitor-check-in" className="btn primary">
          <Icon name="plus" className="sm" />
          Expect a visitor
        </Link>}>
      <Suspense>
        <VisitorApproval />
      </Suspense>
    </AppShell>
  );
}
