// SCR-081 · Add Staff
// Module: Teachers & Staff · Role: School Admin · Release: MVP · Stories: US-0161 / US-0162
// Mock: screens/SCR-081_Add_Staff.html
// Wired: POST /api/v1/school/staff (returns a one-time password), GET /departments. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { StaffForm } from "@/features/staff/StaffForm";

export const metadata = { title: "SCR-081 · Add Staff · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-081">
      <Suspense>
        <StaffForm mode="add" />
      </Suspense>
    </AppShell>
  );
}
