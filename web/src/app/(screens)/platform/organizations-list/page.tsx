// SCR-010 · Organizations List
// Module: Super Admin / SaaS Administration · Role: Super Admin · Release: MVP · Stories: US-0019 / US-0020
// Mock: screens/SCR-010_Organizations_List.html
// Backend: the old frontend served this at /super-admin/tenants — Paginated table with search and status
// Wired: GET /api/v1/super-admin/tenants (search, status, page), billing, usage-overview. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { OrganizationsList } from "@/features/platform/OrganizationsList";

export const metadata = { title: "SCR-010 · Organizations List · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-010" actions={<Link href="/platform/add-organization" className="btn primary">
          <Icon name="plus" className="sm" />
          Add organization
        </Link>}>
      <Suspense>
        <OrganizationsList />
      </Suspense>
    </AppShell>
  );
}
