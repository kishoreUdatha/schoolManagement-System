// NEW-094 · Behaviour Notes
// Module: Health / Counselling / Discipline · Role: Teacher · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /teacher/behaviour
// Wired: GET /api/v1/teacher/my-classes, GET /teacher/behaviour/section/{section_id} (?period_kind=&period_key=), GET /teacher/behaviour/student/{student_id}, POST /teacher/behaviour, POST /teacher/behaviour/ai-suggest (suggestion only). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { RoleGate } from "@/features/self/kit";
import { TEACHERS } from "@/features/self/roles";
import { BehaviourNotes } from "@/features/teacher/BehaviourNotes";

export const metadata = { title: "NEW-094 · Behaviour Notes · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-094"
    >
      <RoleGate roles={TEACHERS} message="Behaviour notes are written by class teachers from a teacher login.">
        <Suspense>
          <BehaviourNotes />
        </Suspense>
      </RoleGate>
    </AppShell>
  );
}
