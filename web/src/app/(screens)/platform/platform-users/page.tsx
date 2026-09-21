// SCR-016 · Platform Users
// Module: Super Admin / SaaS Administration · Role: Super Admin · Release: Phase 3 · Stories: US-0031 / US-0032
// Mock: screens/SCR-016_Platform_Users.html
// Backend: the old frontend served this at /super-admin/users — Operator accounts; the last active one cannot be switched off
// Wired: GET/POST /api/v1/super-admin/platform-users, PATCH platform-users/{id}, POST platform-users/{id}/reset-password. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AddOperatorButton, PlatformUsers } from "@/features/platform/PlatformUsers";

export const metadata = { title: "SCR-016 · Platform Users · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-016" actions={<AddOperatorButton />}>
      <Suspense>
        <PlatformUsers />
      </Suspense>
    </AppShell>
  );
}
