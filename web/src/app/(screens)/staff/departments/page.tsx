// NEW-085 · Departments
// Module: Teachers & Staff · Role: School Admin · Release: Extension
// New screen (no mock): the same editor as SCR-031 Department Setup, in the
// school admin's own menu — departments are needed for staff, job openings
// and subjects, and SCR-031 lives in the platform's school-setup module.
// Wired: GET/POST /api/v1/school/departments, PUT /departments/{id} (?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { DepartmentSetup } from "@/features/setup/DepartmentSetup";

export const metadata = { title: "NEW-085 · Departments · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-085">
      <Suspense>
        <DepartmentSetup />
      </Suspense>
    </AppShell>
  );
}
