// SCR-061 · Student Examination & Results
// Module: Students · Role: School Admin · Release: MVP · Stories: US-0121 / US-0122
// Mock: screens/SCR-061_Student_Examination_Results.html
// Wired: GET /api/v1/school/student-detail/{id}/exams, /exams/{exam_id}/sections/{section_id}/remarks, /students/{id}, /profile (?id=). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { PrintButton, StudentResults } from "@/features/students/StudentResults";

export const metadata = { title: "SCR-061 · Student Examination & Results · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-061"
      actions={
        <>
          <PrintButton />
          <Link href="/examinations/student-result" className="btn primary">
            <Icon name="arrow" className="sm" />
            Download result
          </Link>
        </>
      }
    >
      <Suspense>
        <StudentResults />
      </Suspense>
    </AppShell>
  );
}
