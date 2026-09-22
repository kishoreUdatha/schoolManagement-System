// SCR-082 · Staff Profile
// Module: Teachers & Staff · Role: School Admin · Release: MVP · Stories: US-0163 / US-0164
// Mock: screens/SCR-082_Staff_Profile.html
// Wired: GET /api/v1/school/staff-ops/{id}/profile (?id=). The header stays and ?tab= swaps the content (allocation, workload, documents, attendance, leave). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { StaffProfile, StaffProfileActions } from "@/features/staff/StaffProfile";

export const metadata = { title: "SCR-082 · Staff Profile · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-082"
      actions={
        <Suspense>
          <StaffProfileActions />
        </Suspense>
      }
    >
      <Suspense>
        <StaffProfile />
      </Suspense>
    </AppShell>
  );
}
