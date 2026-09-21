// SCR-031 · Department Setup
// Module: Organization / School / Branch Setup · Role: Super Admin · Release: Phase 2 · Stories: US-0061 / US-0062
// Mock: screens/SCR-031_Department_Setup.html
// Wired: GET/POST /api/v1/school/departments, PUT /departments/{id}, GET /directory/staff, /academic-years, /branches (?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { DepartmentSetup } from "@/features/setup/DepartmentSetup";
import { SubmitFor } from "@/features/setup/bits";

export const metadata = { title: "SCR-031 · Department Setup · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-031" actions={<SubmitFor form="department-form">Save department</SubmitFor>}>
      <Suspense>
        <DepartmentSetup />
      </Suspense>
    </AppShell>
  );
}
