// SCR-145 · Marks Entry
// Module: Examinations / Marks / Results · Role: Teacher · Release: MVP · Stories: US-0289 / US-0290
// Mock: screens/SCR-145_Marks_Entry.html
// Backend: the old frontend served this at /teacher/marks/papers/[id] — Roster, status, marks, live grade, save
// Wired: GET /api/v1/teacher/marks/papers, /teacher/my-classes, /teacher/marks/papers/{id}?section_id=; POST …/save, …/mark-all-absent (?paper=&section=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { MarksEntry } from "@/features/examinations/MarksEntry";

export const metadata = { title: "SCR-145 · Marks Entry · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-145">
      <Suspense>
        <MarksEntry />
      </Suspense>
    </AppShell>
  );
}
