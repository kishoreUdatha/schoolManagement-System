// SCR-128 · Homework List
// Module: Homework & Assignments · Role: Teacher · Release: MVP · Stories: US-0255 / US-0256
// Mock: screens/SCR-128_Homework_List.html
// Wired: GET /api/v1/teacher/homework, /teacher/homework/{id}/submissions, /teacher/my-classes. Hand-maintained.

import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { TeacherWorkList } from "@/features/homework/TeacherWorkList";

export const metadata = { title: "SCR-128 · Homework List · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-128" actions={<Link href="/homework/create-homework" className="btn primary">
        <Icon name="plus" className="sm" />
        Create homework
      </Link>}>
      <Suspense>
        <TeacherWorkList kind="homework" />
      </Suspense>
    </AppShell>
  );
}
