// SCR-024 · School Details
// Module: Organization / School / Branch Setup · Role: Super Admin · Release: MVP · Stories: US-0047 / US-0048
// Mock: screens/SCR-024_School_Details.html
// Wired: GET /api/v1/school/profile, /academic-years, /branches, /students (count), /audit-log. Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { SchoolDetails } from "@/features/setup/SchoolProfile";

export const metadata = { title: "SCR-024 · School Details · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-024" actions={<Link href="/school-setup/school-branding-profile" className="btn primary">
        <Icon name="arrow" className="sm" />
        Edit school
      </Link>}>
      <SchoolDetails />
    </AppShell>
  );
}
