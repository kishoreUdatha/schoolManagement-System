// SCR-086 · Teacher Workload
// Module: Teachers & Staff · Role: School Admin · Release: Phase 2 · Stories: US-0171 / US-0172
// Mock: screens/SCR-086_Teacher_Workload.html
// Wired: GET /api/v1/school/staff-ops/workload. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { TeacherWorkload } from "@/features/staff/TeacherWorkload";

export const metadata = { title: "SCR-086 · Teacher Workload · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-086"
      actions={
        <Link href="/staff/teacher-allocation" className="btn primary">
          <Icon name="arrow" className="sm" />
          View allocation
        </Link>
      }
    >
      <Suspense>
        <TeacherWorkload />
      </Suspense>
    </AppShell>
  );
}
