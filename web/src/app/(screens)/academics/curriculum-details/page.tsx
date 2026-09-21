// SCR-099 · Curriculum Details
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: MVP · Stories: US-0197 / US-0198
// Mock: screens/SCR-099_Curriculum_Details.html
// Wired: GET /api/v1/school/syllabus?academic_year_id, GET /syllabus/{cs_id} (?id=), PUT /syllabus/topics/{id}/coverage, POST /syllabus/chapters/{id}/topics. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { EditSyllabusLink, SyllabusTree } from "@/features/academics/SyllabusTree";

export const metadata = { title: "SCR-099 · Curriculum Details · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-099"
      actions={
        <Suspense>
          <EditSyllabusLink />
        </Suspense>
      }
    >
      <Suspense>
        <SyllabusTree mode="view" />
      </Suspense>
    </AppShell>
  );
}
