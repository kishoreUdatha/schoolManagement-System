// SCR-100 · Units / Chapters / Topics
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: MVP · Stories: US-0199 / US-0200
// Mock: screens/SCR-100_Units_Chapters_Topics.html
// Wired: GET /api/v1/school/syllabus, GET /syllabus/{cs_id} (?id=), POST /{cs_id}/chapters, PUT /{cs_id}/chapter-order, PUT/DELETE /syllabus/chapters/{id}, POST /chapters/{id}/topics, PUT /chapters/{id}/topic-order, PUT/DELETE /syllabus/topics/{id}, PUT /topics/{id}/coverage, GET /{cs_id}/copy-sources, POST /{cs_id}/copy. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageAction } from "@/features/academics/setupKit";
import { SyllabusTree } from "@/features/academics/SyllabusTree";

export const metadata = { title: "SCR-100 · Units / Chapters / Topics · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-100"
      actions={
        <PageAction name="add-unit" icon="plus" primary>
          Add unit
        </PageAction>
      }
    >
      <Suspense>
        <SyllabusTree mode="edit" />
      </Suspense>
    </AppShell>
  );
}
