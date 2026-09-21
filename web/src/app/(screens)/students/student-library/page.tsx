// SCR-067 · Student Library
// Module: Students · Role: School Admin · Release: Phase 3 · Stories: US-0133 / US-0134
// Mock: screens/SCR-067_Student_Library.html
// Wired: GET /api/v1/school/library/loans?student_id=&open_only=false, /students/{id} (?id=). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { StudentLibrary } from "@/features/students/StudentLibrary";

export const metadata = { title: "SCR-067 · Student Library · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-067"
      actions={
        <Link href="/library/library-catalogue" className="btn primary">
          <Icon name="arrow" className="sm" />
          View catalogue
        </Link>
      }
    >
      <Suspense>
        <StudentLibrary />
      </Suspense>
    </AppShell>
  );
}
