// SCR-232 · Staff & Vehicle Gate Log
// Module: Visitor / Gate / Security · Role: Security · Release: Phase 3 · Stories: US-0463 / US-0464
// Mock: screens/SCR-232_Staff_Vehicle_Gate_Log.html
// Backend: the old frontend served this at /school/front-desk/staff-log — Vehicle gate log; a visit cannot say the arriver is staff
// Wired: GET /api/v1/school/front-desk/visits (on, q, inside_only). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { GateLog } from "@/features/security/FrontDesk";

export const metadata = { title: "SCR-232 · Staff & Vehicle Gate Log · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-232" actions={<button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>}>
      <Suspense>
        <GateLog />
      </Suspense>
    </AppShell>
  );
}
