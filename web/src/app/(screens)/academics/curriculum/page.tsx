// SCR-098 · Curriculum
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: MVP · Stories: US-0195 / US-0196
// Mock: screens/SCR-098_Curriculum.html
// Wired: GET/POST /api/v1/school/academics/curricula, POST /curricula/{id}/activate|retire, PUT /curricula/{id}/subjects, DELETE /curricula/{id}/subjects/{subject_id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Curricula } from "@/features/academics/Curricula";
import { PageAction } from "@/features/academics/setupKit";

export const metadata = { title: "SCR-098 · Curriculum · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-098"
      actions={
        <PageAction name="add" icon="plus" primary>
          Create curriculum
        </PageAction>
      }
    >
      <Suspense>
        <Curricula />
      </Suspense>
    </AppShell>
  );
}
