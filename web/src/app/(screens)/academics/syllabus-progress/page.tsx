// SCR-105 · Syllabus Progress
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: Phase 3 · Stories: US-0209 / US-0210
// Mock: screens/SCR-105_Syllabus_Progress.html
// Wired: GET /api/v1/school/syllabus (academic_year_id), GET /academic-years. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { SyllabusProgress } from "@/features/academics/SyllabusProgress";

export const metadata = { title: "SCR-105 · Syllabus Progress · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-105"
      actions={
        // Coverage is recorded topic by topic in the curriculum screens.
        <Link href="/academics/curriculum" className="btn primary">
          <Icon name="check" className="sm" />
          Update progress
        </Link>
      }
    >
      <Suspense>
        <SyllabusProgress />
      </Suspense>
    </AppShell>
  );
}
