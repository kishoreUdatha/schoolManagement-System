// SCR-058 · Edit Student
// Module: Students · Role: School Admin · Release: MVP
// Mock: screens/SCR-058_Edit_Student.html
// Wired: GET + PATCH /api/v1/school/students/{id} (?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { StudentForm } from "@/features/students/StudentForm";

export const metadata = { title: "SCR-058 · Edit Student · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-058">
      <Suspense>
        <StudentForm mode="edit" />
      </Suspense>
    </AppShell>
  );
}
