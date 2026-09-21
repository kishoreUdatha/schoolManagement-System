// SCR-080 · Staff Directory
// Module: Teachers & Staff · Role: School Admin · Release: MVP · Stories: US-0159 / US-0160
// Mock: screens/SCR-080_Staff_Directory.html
// Wired: GET /api/v1/school/staff (role, status, search), GET /staff-leaves?status=approved. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { StaffDirectory } from "@/features/staff/StaffDirectory";

export const metadata = { title: "SCR-080 · Staff Directory · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-080"
      actions={
        <Link href="/staff/add-staff" className="btn primary">
          <Icon name="plus" className="sm" />
          Add staff
        </Link>
      }
    >
      <Suspense>
        <StaffDirectory />
      </Suspense>
    </AppShell>
  );
}
