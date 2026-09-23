// NEW-097 · My Profile
// Module: Teachers & Staff · Role: Staff · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/staff/profile, PATCH /api/v1/staff/profile. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { RoleGate } from "@/features/self/kit";
import { MyProfile } from "@/features/self/MyProfile";
import { EMPLOYEES } from "@/features/self/roles";

export const metadata = { title: "NEW-097 · My Profile · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-097">
      <RoleGate roles={EMPLOYEES} message="This is an employee's own record. Sign in with your staff login to see yours.">
        <Suspense>
          <MyProfile />
        </Suspense>
      </RoleGate>
    </AppShell>
  );
}
