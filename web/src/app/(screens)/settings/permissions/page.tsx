// SCR-286 · Permissions
// Module: Settings / Roles / Permissions / Audit · Role: IT Admin · Release: MVP · Stories: US-0571 / US-0572
// Mock: screens/SCR-286_Permissions.html
// Wired: GET /api/v1/school/roles, GET /permissions, PUT/DELETE /roles/{id} (?id=), POST /roles (?new=1). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SubmitFor } from "@/features/setup/bits";
import { RolePermissions } from "@/features/settings/RolePermissions";

export const metadata = { title: "SCR-286 · Permissions · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-286" actions={<SubmitFor form="permissions-form">Save permissions</SubmitFor>}>
      <Suspense>
        <RolePermissions />
      </Suspense>
    </AppShell>
  );
}
