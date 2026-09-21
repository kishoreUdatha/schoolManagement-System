// SCR-083 · Edit Staff
// Module: Teachers & Staff · Role: School Admin · Release: MVP · Stories: US-0165 / US-0166
// Mock: screens/SCR-083_Edit_Staff.html
// Wired: GET/PATCH /api/v1/school/staff/{id} (?id=), GET /departments. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { StaffForm } from "@/features/staff/StaffForm";

export const metadata = { title: "SCR-083 · Edit Staff · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-083">
      <Suspense>
        <StaffForm mode="edit" />
      </Suspense>
    </AppShell>
  );
}
