// SCR-287 · Role Permission Matrix
// Module: Settings / Roles / Permissions / Audit · Role: IT Admin · Release: MVP · Stories: US-0573 / US-0574
// Mock: screens/SCR-287_Role_Permission_Matrix.html
// Wired: GET /api/v1/school/roles, GET /permissions, PUT /roles/{id} for each changed role. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { SubmitFor } from "@/features/setup/bits";
import { PermissionMatrix } from "@/features/settings/PermissionMatrix";

export const metadata = { title: "SCR-287 · Role Permission Matrix · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-287" actions={<SubmitFor form="matrix-form">Save matrix</SubmitFor>}>
      <PermissionMatrix />
    </AppShell>
  );
}
