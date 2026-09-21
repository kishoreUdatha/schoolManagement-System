// SCR-082 · Staff Profile
// Module: Teachers & Staff · Role: School Admin · Release: MVP · Stories: US-0163 / US-0164
// Mock: screens/SCR-082_Staff_Profile.html
// Wired: GET /api/v1/school/staff-ops/{id}/profile (?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { StaffProfile, WithStaffLink } from "@/features/staff/StaffProfile";

export const metadata = { title: "SCR-082 · Staff Profile · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-082"
      actions={
        <Suspense>
          <WithStaffLink screen={91} icon="arrow" primary={false}>
            Exit / offboarding
          </WithStaffLink>
          <WithStaffLink screen={83} icon="arrow">
            Edit staff
          </WithStaffLink>
        </Suspense>
      }
    >
      <Suspense>
        <StaffProfile />
      </Suspense>
    </AppShell>
  );
}
