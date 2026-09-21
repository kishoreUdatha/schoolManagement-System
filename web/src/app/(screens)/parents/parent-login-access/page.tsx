// SCR-076 · Parent Login Access
// Module: Parents & Guardians · Role: School Admin · Release: Phase 2 · Stories: US-0151 / US-0152
// Mock: screens/SCR-076_Parent_Login_Access.html
// Backend: the old frontend served this at /school/parents — Activate, deactivate, reset password
// Wired: GET /api/v1/school/parents/{id} (?id=), POST /parents/{id}/activate|deactivate|reset-password, GET /audit-log. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ParentAccess } from "@/features/parents/ParentAccess";

export const metadata = { title: "SCR-076 · Parent Login Access · BrightCampus" };

// Not wired: "Send invitation" — no invite endpoint; a new login is created on Add guardian and re-issued by Reset password.
export default function Page() {
  return (
    <AppShell screen="SCR-076">
      <Suspense>
        <ParentAccess />
      </Suspense>
    </AppShell>
  );
}
