// SCR-131 · Student Homework View
// Module: Homework & Assignments · Role: Student · Release: MVP · Stories: US-0261 / US-0262
// Mock: screens/SCR-131_Student_Homework_View.html
// Wired: GET /api/v1/student/homework + .../{id}/submission; parent: /parent/me/children/{id}/homework. Hand-maintained.

import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LearnerHomework } from "@/features/homework/LearnerHomework";

export const metadata = { title: "SCR-131 · Student Homework View · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-131" actions={<Link href="/homework/homework-submission" className="btn primary">
        <Icon name="arrow" className="sm" />
        Open homework
      </Link>}>
      <Suspense>
        <LearnerHomework />
      </Suspense>
    </AppShell>
  );
}
