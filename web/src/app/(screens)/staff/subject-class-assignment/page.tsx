// SCR-085 · Subject & Class Assignment
// Module: Teachers & Staff · Role: School Admin · Release: MVP · Stories: US-0169 / US-0170
// Mock: screens/SCR-085_Subject_Class_Assignment.html
// Wired: GET/POST /api/v1/school/classes/{id}/subjects, PATCH/DELETE /class-subjects/{id}, GET /subjects, /staff?role=teacher, /classes. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { SubjectAssignment } from "@/features/staff/SubjectAssignment";

export const metadata = { title: "SCR-085 · Subject & Class Assignment · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-085"
      actions={
        <Link href="/staff/teacher-allocation" className="btn primary">
          <Icon name="arrow" className="sm" />
          Class teachers
        </Link>
      }
    >
      <Suspense>
        <SubjectAssignment />
      </Suspense>
    </AppShell>
  );
}
