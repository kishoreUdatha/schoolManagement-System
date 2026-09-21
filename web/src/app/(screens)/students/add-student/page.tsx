// SCR-056 · Add Student
// Module: Students · Role: School Admin · Release: MVP · Stories: US-0111 / US-0112
// Mock: screens/SCR-056_Add_Student.html
// Wired: POST /api/v1/school/students, then POST /students/{id}/guardians. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { StudentForm } from "@/features/students/StudentForm";

export const metadata = { title: "SCR-056 · Add Student · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-056">
      <Suspense>
        <StudentForm mode="add" />
      </Suspense>
    </AppShell>
  );
}
