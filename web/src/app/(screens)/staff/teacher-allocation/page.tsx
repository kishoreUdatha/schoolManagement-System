// SCR-084 · Teacher Allocation
// Module: Teachers & Staff · Role: School Admin · Release: MVP · Stories: US-0167 / US-0168
// Mock: screens/SCR-084_Teacher_Allocation.html
// Wired: GET /api/v1/school/staff-ops/workload, GET /classes, GET /staff?role=teacher, PATCH /sections/{id} (class teacher). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { TeacherAllocation } from "@/features/staff/TeacherAllocation";

export const metadata = { title: "SCR-084 · Teacher Allocation · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-084"
      actions={
        <Link href="/staff/subject-class-assignment" className="btn primary">
          <Icon name="arrow" className="sm" />
          Assign subject teachers
        </Link>
      }
    >
      <Suspense>
        <TeacherAllocation />
      </Suspense>
    </AppShell>
  );
}
