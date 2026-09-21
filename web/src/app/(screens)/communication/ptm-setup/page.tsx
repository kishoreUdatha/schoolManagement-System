// SCR-250 · PTM Setup
// Module: Events / PTM / Communication · Role: Teacher · Release: Phase 2 · Stories: US-0499 / US-0500
// Mock: screens/SCR-250_PTM_Setup.html
// Backend: the old frontend served this at /teacher/ptm — A teacher arranges for their own class only
// Wired: teacher GET /api/v1/teacher/ptm, /teacher/ptm/my-classes, POST /teacher/ptm/sessions?section_id=, /sessions/{id}/publish; office GET/POST /api/v1/school/ptm, GET/PUT/DELETE /ptm/{id} (?id=), POST /ptm/{id}/teachers, DELETE /ptm/{id}/teachers/{user_id}, POST /ptm/{id}/publish, GET /school/directory/staff. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { PtmSetup } from "@/features/communication/PtmSetup";

export const metadata = { title: "SCR-250 · PTM Setup · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-250" actions={<button type="submit" form="ptm-form" value="publish" className="btn primary">
        <Icon name="check" className="sm" />
        Publish PTM
      </button>}>
      <Suspense>
        <PtmSetup />
      </Suspense>
    </AppShell>
  );
}
