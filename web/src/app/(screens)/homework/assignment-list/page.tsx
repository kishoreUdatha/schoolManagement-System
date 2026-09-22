// SCR-134 · Assignment List
// Module: Homework & Assignments · Role: Teacher · Release: Phase 2 · Stories: US-0267 / US-0268
// Mock: screens/SCR-134_Assignment_List.html
// Wired: GET /api/v1/teacher/projects, /teacher/projects/{id}/progress, /teacher/my-classes; PATCH/DELETE /teacher/projects/{id}. Hand-maintained.

import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { TeacherWorkList } from "@/features/homework/TeacherWorkList";

export const metadata = { title: "SCR-134 · Assignment List · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-134" actions={<Link href="/homework/create-assignment" className="btn primary">
        <Icon name="plus" className="sm" />
        Create assignment
      </Link>}>
      <Suspense>
        <TeacherWorkList kind="project" />
      </Suspense>
    </AppShell>
  );
}
