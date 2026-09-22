// NEW-096 · My Students
// Module: Students · Role: Teacher · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /teacher/my-classes, /teacher/sections/{id}/roster and /teacher/students/{id}
// Wired: GET /api/v1/teacher/my-classes, GET /teacher/sections/{id}/students, GET /teacher/students/{id} (?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { RoleGate } from "@/features/self/kit";
import { TEACHERS } from "@/features/self/roles";
import { MyStudents } from "@/features/teacher/MyStudents";

export const metadata = { title: "NEW-096 · My Students · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-096"
    >
      <RoleGate roles={TEACHERS} message="This is a teacher's list of their own classes and students. The school office finds students in the Student Directory.">
        <Suspense>
          <MyStudents />
        </Suspense>
      </RoleGate>
    </AppShell>
  );
}
