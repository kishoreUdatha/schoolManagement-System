// SCR-285 · Roles
// Module: Settings / Roles / Permissions / Audit · Role: IT Admin · Release: MVP · Stories: US-0569 / US-0570
// Mock: screens/SCR-285_Roles.html
// Wired: GET /api/v1/school/roles, GET /permissions. Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { RolesList } from "@/features/settings/Roles";

export const metadata = { title: "SCR-285 · Roles · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-285" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/settings/permissions?new=1" className="btn primary">
          <Icon name="plus" className="sm" />
          Create role
        </Link>
      </>}>
      <RolesList />
    </AppShell>
  );
}
