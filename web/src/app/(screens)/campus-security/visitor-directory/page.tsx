// NEW-070 · Visitor Directory
// Module: Visitor / Gate / Security · Role: Security · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /school/front-desk — Visitor master records, history, block list
// Wired: GET /api/v1/school/front-desk/visitors (search, blocked_only), GET/PUT /visitors/{id} (?id=), GET /visitors/{id}/visits, POST /visitors/{id}/block, POST /visitors/backfill. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { VisitorDirectory } from "@/features/security/VisitorDirectory";

export const metadata = { title: "NEW-070 · Visitor Directory · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-070"
      actions={
        <Link href="/campus-security/visitor-check-in" className="btn primary">
          <Icon name="plus" className="sm" />
          Check in a visitor
        </Link>
      }
    >
      <Suspense>
        <VisitorDirectory />
      </Suspense>
    </AppShell>
  );
}
