// SCR-106 · Teaching Resources
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: Phase 3 · Stories: US-0211 / US-0212
// Mock: screens/SCR-106_Teaching_Resources.html
// Wired: GET/POST (multipart) /api/v1/school/teaching-resources, PATCH/DELETE /teaching-resources/{id}, GET /teaching-resources/{id}/file, GET /syllabus. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { TeachingResources } from "@/features/academics/TeachingResources";
import { PageAction } from "@/features/academics/planKit";

export const metadata = { title: "SCR-106 · Teaching Resources · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-106"
      actions={
        <PageAction action="resources:upload" icon="check" primary>
          Upload resource
        </PageAction>
      }
    >
      <Suspense>
        <TeachingResources />
      </Suspense>
    </AppShell>
  );
}
