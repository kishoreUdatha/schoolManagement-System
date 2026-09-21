// SCR-288 · User Role Assignment
// Module: Settings / Roles / Permissions / Audit · Role: IT Admin · Release: MVP · Stories: US-0575 / US-0576
// Mock: screens/SCR-288_User_Role_Assignment.html
// Wired: GET/POST /api/v1/school/role-assignments, DELETE /role-assignments/{id}, GET /roles, /directory/staff, /branches, /profile. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { SubmitFor } from "@/features/setup/bits";
import { RoleAssignment } from "@/features/settings/RoleAssignment";

export const metadata = { title: "SCR-288 · User Role Assignment · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-288" actions={<SubmitFor form="assign-form">Assign role</SubmitFor>}>
      <RoleAssignment />
    </AppShell>
  );
}
