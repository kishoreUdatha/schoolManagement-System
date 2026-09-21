// SCR-130 · Homework Details
// Module: Homework & Assignments · Role: Teacher · Release: MVP · Stories: US-0259 / US-0260
// Mock: screens/SCR-130_Homework_Details.html
// Wired: GET /api/v1/teacher/homework/{id} (?id=), .../submissions, /teacher/my-classes, /school/rubrics/{id}; POST .../close; DELETE. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { HomeworkDetails } from "@/features/homework/HomeworkDetails";
import { WithIdLink } from "@/features/homework/shared";

export const metadata = { title: "SCR-130 · Homework Details · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-130" actions={<Suspense><WithIdLink screen={133} fallback={128} icon="arrow">
        View submissions
      </WithIdLink></Suspense>}>
      <Suspense>
        <HomeworkDetails />
      </Suspense>
    </AppShell>
  );
}
