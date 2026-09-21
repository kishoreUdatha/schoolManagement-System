// SCR-077 · Parent-Teacher Interactions
// Module: Parents & Guardians · Role: School Admin · Release: Phase 3 · Stories: US-0153 / US-0154
// Mock: screens/SCR-077_Parent_Teacher_Interactions.html
// Backend: the old frontend served this at /school/ptm — Meetings and slots; messages are teacher-only
// Wired: GET /api/v1/school/parents/{id} (?id=), /ptm, /ptm/{id}. Hand-maintained.

import { Suspense } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { ParentInteractions } from "@/features/parents/ParentInteractions";

export const metadata = { title: "SCR-077 · Parent-Teacher Interactions · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-077" actions={<Link href="/communication/ptm-slot-booking" className="btn primary">
        <Icon name="arrow" className="sm" />
        Book meeting
      </Link>}>
      <Suspense>
        <ParentInteractions />
      </Suspense>
    </AppShell>
  );
}
