// SCR-022 · Schools List
// Module: Organization / School / Branch Setup · Role: Super Admin · Release: MVP · Stories: US-0043 / US-0044
// Mock: screens/SCR-022_Schools_List.html
// Wired: GET /api/v1/super-admin/tenants (search, status, paging), GET /tenants/{id} and /tenants/{id}/usage per row. Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { SchoolsList } from "@/features/setup/Organizations";

export const metadata = { title: "SCR-022 · Schools List · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-022" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/school-setup/add-school" className="btn primary">
          <Icon name="plus" className="sm" />
          Add school
        </Link>
      </>}>
      <SchoolsList />
    </AppShell>
  );
}
