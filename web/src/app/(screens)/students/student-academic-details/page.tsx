// SCR-059 · Student Academic Details
// Module: Students · Role: School Admin · Release: MVP · Stories: US-0117 / US-0118
// Mock: screens/SCR-059_Student_Academic_Details.html
// Wired: GET /api/v1/school/student-detail/{id}/academic, /student-detail/{id}/exams, /students/{id}, /classes, /staff (?id=). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { StudentAcademic } from "@/features/students/StudentAcademic";

export const metadata = { title: "SCR-059 · Student Academic Details · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-059"
      actions={
        <Link href="/examinations/report-card" className="btn primary">
          <Icon name="arrow" className="sm" />
          View report card
        </Link>
      }
    >
      <Suspense>
        <StudentAcademic />
      </Suspense>
    </AppShell>
  );
}
