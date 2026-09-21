// SCR-097 · Subject Groups
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: MVP · Stories: US-0193 / US-0194
// Mock: screens/SCR-097_Subject_Groups.html
// Wired: GET/POST /api/v1/school/academics/groups, PATCH/DELETE /academics/groups/{id}, POST /groups/{id}/subjects, DELETE /groups/{id}/subjects/{subject_id}, GET /subjects. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageAction } from "@/features/academics/setupKit";
import { SubjectGroups } from "@/features/academics/SubjectGroups";

export const metadata = { title: "SCR-097 · Subject Groups · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-097"
      actions={
        <>
          <PageAction name="export" icon="download">
            Export
          </PageAction>
          <PageAction name="add" icon="plus" primary>
            Create subject group
          </PageAction>
        </>
      }
    >
      <Suspense>
        <SubjectGroups />
      </Suspense>
    </AppShell>
  );
}
