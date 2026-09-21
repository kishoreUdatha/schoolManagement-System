// SCR-284 · User Management
// Module: Settings / Roles / Permissions / Audit · Role: IT Admin · Release: MVP · Stories: US-0567 / US-0568
// Mock: screens/SCR-284_User_Management.html
// Wired: GET /api/v1/school/staff (role, status, search), GET /role-assignments, POST /staff/{id}/activate|deactivate|reset-password. Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { UserManagement } from "@/features/settings/UserManagement";

export const metadata = { title: "SCR-284 · User Management · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-284" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/staff/add-staff" className="btn primary">
          <Icon name="arrow" className="sm" />
          Invite user
        </Link>
      </>}>
      <UserManagement />
    </AppShell>
  );
}
